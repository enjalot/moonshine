import { useEffect, useRef, useState, type RefObject } from 'react'
import { EDIT_ENABLED, useEdit } from '../lib/EditContext'

// Dev-only Cmd/Ctrl-drag reordering of top-level blocks. Attaches pointer
// listeners to the article container; while a modifier is held, dragging a
// block past its neighbours' midpoints shows a drop line, and releasing
// reorders the markdown (via EditContext.moveBlock → save → HMR). The plain
// Cmd-click-to-edit affordance is preserved: a press that doesn't move past
// a small threshold falls through to the click handlers.
//
// The article's direct element children map 1:1 and in document order to
// the parsed top-level blocks (every block — paragraph, figure, list,
// fenced code, `$$` math, … — renders exactly one top-level element), once
// the non-content children (header, footers, dev chrome) are filtered out.
// That correspondence, not per-element markers, is what links a dragged DOM
// element to its block index, so every block type is draggable.
//
// Nothing here renders in production — the wrapper returns null on the
// build constant before any hooks, so the whole layer is tree-shaken.

type Props = {
  containerRef: RefObject<HTMLElement | null>
}

const DRAG_THRESHOLD = 5

export default function BlockReorderLayer(props: Props) {
  if (!EDIT_ENABLED) return null
  return <ReorderLayer {...props} />
}

// Article children that aren't body blocks: the header, the series/footer
// nav, the moonshine attribution, and the edit chrome / this layer.
function isBlockChild(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'header' || tag === 'footer') return false
  if (
    el.classList.contains('mn-chrome') ||
    el.classList.contains('mn-drop-indicator')
  ) {
    return false
  }
  return true
}

function ReorderLayer({ containerRef }: Props) {
  const { armed, blocks, moveBlock } = useEdit()
  const [indicator, setIndicator] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)

  // Listeners bind once; refs keep them reading current values.
  const armedRef = useRef(armed)
  const blockCountRef = useRef(blocks.length)
  const moveRef = useRef(moveBlock)
  armedRef.current = armed
  blockCountRef.current = blocks.length
  moveRef.current = moveBlock

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    type DragState = {
      from: number
      pointerId: number
      startY: number
      started: boolean
      gap: number
      el: HTMLElement
      rects: { top: number; bottom: number; left: number; width: number }[]
    }
    let drag: DragState | null = null
    let suppressClick = false

    const blockEls = () =>
      Array.from(container.children).filter(isBlockChild) as HTMLElement[]

    // The top-level block element that is (or contains) `target`.
    const blockElFor = (target: Element | null): HTMLElement | null => {
      let el = target as HTMLElement | null
      while (el && el.parentElement !== container) el = el.parentElement
      return el && isBlockChild(el) ? el : null
    }

    // Which gap (0..n) the pointer is over, counting blocks whose vertical
    // midpoint sits above the pointer.
    const gapAt = (y: number, rects: DragState['rects']) => {
      let g = 0
      for (const r of rects) {
        if ((r.top + r.bottom) / 2 < y) g++
        else break
      }
      return g
    }

    const showIndicator = (gap: number, rects: DragState['rects']) => {
      if (rects.length === 0) return
      const ref = rects[Math.min(gap, rects.length - 1)]
      const top =
        gap === 0
          ? rects[0].top
          : gap >= rects.length
            ? rects[rects.length - 1].bottom
            : (rects[gap - 1].bottom + rects[gap].top) / 2
      setIndicator({ top, left: ref.left, width: ref.width })
    }

    const cleanup = () => {
      document.body.classList.remove('mn-reordering')
      drag?.el.classList.remove('mn-dragging')
      drag = null
      setIndicator(null)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (!armedRef.current || e.button !== 0) return
      if (blockCountRef.current < 2) return
      const el = blockElFor(e.target as Element | null)
      if (!el) return
      const from = blockEls().indexOf(el)
      if (from < 0) return
      // Own the gesture so figure-internal pointer handlers don't also fire
      // during a Cmd drag; the later click still reaches the edit handlers
      // (separate event) for a no-move Cmd-click.
      e.stopPropagation()
      drag = {
        from,
        pointerId: e.pointerId,
        startY: e.clientY,
        started: false,
        gap: from,
        el,
        rects: [],
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return
      if (!drag.started) {
        if (Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return
        drag.started = true
        try {
          container.setPointerCapture(drag.pointerId)
        } catch {
          // capture is best-effort
        }
        document.body.classList.add('mn-reordering')
        drag.el.classList.add('mn-dragging')
        drag.rects = blockEls().map((el) => {
          const r = el.getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, left: r.left, width: r.width }
        })
      }
      drag.gap = gapAt(e.clientY, drag.rects)
      showIndicator(drag.gap, drag.rects)
      e.preventDefault()
    }

    const onPointerUp = () => {
      if (!drag) return
      const d = drag
      cleanup()
      if (d.started) {
        suppressClick = true
        // Backstop in case no click follows (preventDefault can swallow it).
        setTimeout(() => {
          suppressClick = false
        }, 0)
        const to = d.gap > d.from ? d.gap - 1 : d.gap
        if (to !== d.from) void moveRef.current(d.from, to)
      }
    }

    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.stopPropagation()
        e.preventDefault()
        suppressClick = false
      }
    }

    container.addEventListener('pointerdown', onPointerDown, true)
    container.addEventListener('pointermove', onPointerMove, true)
    container.addEventListener('pointerup', onPointerUp, true)
    container.addEventListener('pointercancel', cleanup, true)
    container.addEventListener('click', onClick, true)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointermove', onPointerMove, true)
      container.removeEventListener('pointerup', onPointerUp, true)
      container.removeEventListener('pointercancel', cleanup, true)
      container.removeEventListener('click', onClick, true)
      document.body.classList.remove('mn-reordering')
    }
  }, [containerRef])

  if (!indicator) return null
  return (
    <div
      className="mn-drop-indicator"
      style={{ top: indicator.top, left: indicator.left, width: indicator.width }}
    />
  )
}
