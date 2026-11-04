import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { translate, type Draggable } from 'dragology'
import { EDIT_ENABLED, useEdit } from '../lib/EditContext'
import DragRenderer from '../figures/drag/Renderer'
import { each } from '../figures/drag/each'

// Dev-only Cmd/Ctrl-drag reordering of top-level blocks, by declarative
// dragging (see figures/drag/). While a modifier is held, pressing a block
// and moving past a small threshold lifts the article into an overlay of
// clones, each at its block's place. The grabbed block floats under the
// pointer and the rest slide apart to show where it would land: the drag
// is one line, d.closest(every order).withFloating(), and Dragology works
// out the motion from those orders. Dropping reorders the markdown (via
// EditContext.moveBlock → save → HMR); the overlay stays until the
// reordered article arrives, so nothing jumps back in between. The plain
// Cmd-click-to-edit affordance is preserved: a press that doesn't move
// past the threshold falls through to the click handlers.
//
// The article's direct element children map 1:1 and in document order to
// the parsed top-level blocks (every block — paragraph, figure, list,
// fenced code, `$$` math, … — renders exactly one top-level element), once
// the non-content children (header, footers, dev chrome, the GFM footnote
// section) are filtered out. topLevelBlocks upholds the other half of the
// invariant by folding non-rendering nodes (HTML comments, link/footnote
// definitions) into the block that follows them. That correspondence, not
// per-element markers, is what links a dragged DOM element to its block
// index, so every block type is draggable.
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
// nav, the moonshine attribution, and the edit chrome.
function isBlockChild(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'header' || tag === 'footer') return false
  // GFM footnotes render as an appended <section data-footnotes> with no
  // corresponding top-level block.
  if (el.hasAttribute('data-footnotes')) return false
  if (el.classList.contains('mn-chrome') || el.classList.contains('mn-drop-indicator')) {
    return false
  }
  return true
}

// One block as the overlay draws it: where it was (document coordinates),
// and the vertical margins that set its gap to its neighbours.
type Slab = { el: HTMLElement; x: number; y: number; w: number; h: number; mt: number; mb: number }

type Lift = {
  from: number
  slabs: Slab[]
  // Where the pointer is, to hand the press over to Dragology.
  pointer: { x: number; y: number; id: number }
}

// Set while a dropped reorder waits for the article to re-render, so the
// article's own FLIP settle (reorderTransition) doesn't replay the move.
export const reorderInFlight = { current: false }

function ReorderLayer({ containerRef }: Props) {
  const { armed, blocks, moveBlock } = useEdit()
  const [lift, setLift] = useState<Lift | null>(null)

  // Listeners bind once; refs keep them reading current values.
  const armedRef = useRef(armed)
  const blockCountRef = useRef(blocks.length)
  armedRef.current = armed
  blockCountRef.current = blocks.length

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let press: { from: number; pointerId: number; startX: number; startY: number } | null = null
    let suppressClick = false

    const blockEls = () => Array.from(container.children).filter(isBlockChild) as HTMLElement[]

    // The top-level block element that is (or contains) `target`.
    const blockElFor = (target: Element | null): HTMLElement | null => {
      let el = target as HTMLElement | null
      while (el && el.parentElement !== container) el = el.parentElement
      return el && isBlockChild(el) ? el : null
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
      press = { from, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!press) return
      if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD) return
      const sx = window.scrollX
      const sy = window.scrollY
      const slabs = blockEls().map((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { el, x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, mt: parseFloat(cs.marginTop) || 0, mb: parseFloat(cs.marginBottom) || 0 }
      })
      suppressClick = true
      setLift({ from: press.from, slabs, pointer: { x: e.clientX, y: e.clientY, id: press.pointerId } })
      press = null
    }

    const onPointerUp = () => {
      press = null
      if (suppressClick) {
        // Backstop in case no click follows (preventDefault can swallow it).
        setTimeout(() => {
          suppressClick = false
        }, 0)
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
    container.addEventListener('pointercancel', onPointerUp, true)
    container.addEventListener('click', onClick, true)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointermove', onPointerMove, true)
      container.removeEventListener('pointerup', onPointerUp, true)
      container.removeEventListener('pointercancel', onPointerUp, true)
      container.removeEventListener('click', onClick, true)
    }
  }, [containerRef])

  // The overlay leaves when the reordered article arrives (blocks change),
  // or after a while if the save never lands.
  const waiting = useRef<number | null>(null)
  const land = useCallback(() => {
    if (waiting.current !== null) window.clearTimeout(waiting.current)
    waiting.current = null
    reorderInFlight.current = false
    setLift(null)
  }, [])
  useEffect(() => {
    if (waiting.current !== null) land()
  }, [blocks, land])

  const onDone = useCallback(
    (to: number | null) => {
      if (!lift) return
      if (to === null || to === lift.from) {
        // Let the drop settle before the real blocks come back.
        window.setTimeout(() => setLift((l) => (l === lift ? null : l)), 220)
        return
      }
      reorderInFlight.current = true
      waiting.current = window.setTimeout(land, 3000)
      void moveBlock(lift.from, to).catch(land)
    },
    [lift, moveBlock, land],
  )

  return lift ? <Overlay lift={lift} onDone={onDone} /> : null
}

type Order = { order: number[] }

function Overlay({ lift, onDone }: { lift: Lift; onDone: (to: number | null) => void }) {
  const uid = `rb${useId().replace(/:/g, '')}`
  const { slabs, from } = lift
  const ox = Math.min(...slabs.map((s) => s.x))
  const oy = slabs[0].y
  const width = Math.max(...slabs.map((s) => s.x + s.w)) - ox
  const height = slabs[slabs.length - 1].y + slabs[slabs.length - 1].h - oy
  const [state, setState] = useState<Order>({ order: slabs.map((_, i) => i) })

  // Hide the real blocks while their clones stand in.
  useLayoutEffect(() => {
    for (const s of slabs) s.el.style.visibility = 'hidden'
    document.body.classList.add('mn-reordering')
    return () => {
      for (const s of slabs) s.el.style.visibility = ''
      document.body.classList.remove('mn-reordering')
    }
  }, [slabs])

  // Hand the press to Dragology: replay it on the grabbed block's clone,
  // once the renderer has its svg (it takes a second render to get it).
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(press)
    })
    return () => cancelAnimationFrame(frame)
  }, [uid, from, lift.pointer])
  const press = () => {
    const target = document.getElementById(`${uid}-b-${from}`)
    if (!target) return
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: lift.pointer.x,
        clientY: lift.pointer.y,
        pointerId: lift.pointer.id,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
      }),
    )
  }

  const draw = useCallback<Draggable<Order>>(
    ({ state, d, draggedId, isTracking }) => {
      // Blocks stacked in this order, each gap the larger of the two
      // margins that meet there (as CSS collapses them).
      const ys: number[] = []
      let y = 0
      state.order.forEach((b, k) => {
        if (k > 0) y += Math.max(slabs[state.order[k - 1]].mb, slabs[b].mt)
        ys[b] = y
        y += slabs[b].h
      })
      const moveTo = (b: number, j: number) => {
        const rest = state.order.filter((x) => x !== b)
        return { order: [...rest.slice(0, j), b, ...rest.slice(j)] }
      }
      return (
        <g>
          {each(state.order, (b) => {
            const id = `${uid}-b-${b}`
            // Only the grabbed block matters while Dragology tracks it.
            if (isTracking && id !== draggedId) return null
            const s = slabs[b]
            return (
              <g
                id={id}
                className="mn-reorder-clone"
                data-on={id === draggedId ? 'lifted' : undefined}
                transform={translate(s.x - ox, ys[b])}
                dragologyZIndex={id === draggedId ? '/1' : false}
                dragologyOnDrag={() => d.closest(state.order.map((_, j) => moveTo(b, j))).withFloating()}
              >
                <rect className="mn-reorder-backing" width={s.w} height={s.h} />
                <foreignObject width={s.w} height={s.h}>
                  <Clone el={s.el} />
                </foreignObject>
              </g>
            )
          })}
        </g>
      )
    },
    [slabs, uid, ox],
  )

  return createPortal(
    // .article so the article's descendant rules style the clones.
    <div className="article mn-reorder-overlay" style={{ left: ox, top: oy, width, height }}>
      <DragRenderer
        draggable={draw}
        state={state}
        width={width}
        height={height}
        dragThreshold={0}
        onDropState={(next) => {
          setState(next)
          onDone(next.order.indexOf(from))
        }}
      />
    </div>,
    document.body,
  )
}

// A still copy of a block. Canvases are copied by pixel (cloneNode leaves
// them blank); live state (inputs, playing figures) isn't needed here.
function Clone({ el }: { el: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const copy = el.cloneNode(true) as HTMLElement
    copy.style.visibility = 'visible'
    copy.style.margin = '0'
    copy.removeAttribute('id')
    const from = el.querySelectorAll('canvas')
    copy.querySelectorAll('canvas').forEach((c, i) => {
      try {
        c.getContext('2d')?.drawImage(from[i], 0, 0)
      } catch {
        // a tainted or WebGL canvas stays blank
      }
    })
    host.replaceChildren(copy)
    return () => host.replaceChildren()
  }, [el])
  return <div ref={ref} className="mn-reorder-copy" />
}
