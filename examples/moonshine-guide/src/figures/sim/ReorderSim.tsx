import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FigureProps } from '../registry'
import { animateVerticalReorder } from '../../lib/reorderTransition'
import { isSimActivate, SIM_DRAG_LABEL } from './gesture'

// A pure, local-state simulation of moonshine's block reordering. The real
// BlockReorderLayer lets the author hold the modifier and drag a top-level
// block; a drop line marks the target gap, and releasing rewrites the
// markdown order. The open editor also exposes ↑/↓ buttons that nudge a
// block one step. This figure reproduces both, with no EditContext and no
// network — everything is local state over an ordered array.

type Section = { id: string; title: string; line: string }

const INITIAL_SECTIONS: Section[] = [
  { id: 's1', title: 'Introduction', line: 'Why the problem matters and what we will build.' },
  { id: 's2', title: 'The method', line: 'The core idea, stated once and precisely.' },
  { id: 's3', title: 'A worked example', line: 'The method applied end-to-end on real numbers.' },
  { id: 's4', title: 'Conclusion', line: 'What we learned and where it could go next.' },
]

// Geometry of the drop line, in viewport coordinates (it renders fixed).
type Indicator = { top: number; left: number; width: number }

export default function ReorderSim(_props: FigureProps) {
  const [sections, setSections] = useState<Section[]>(INITIAL_SECTIONS)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)

  // Refs to each card so we can read live bounding rects during a drag.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // The gap the pointer currently targets (0..n), resolved on release.
  const dropGap = useRef<number>(0)
  // Pointer-capture bookkeeping so we can clean up on unmount mid-drag.
  const capture = useRef<{ el: HTMLDivElement; pointerId: number } | null>(null)
  const previousTops = useRef<Map<string, number>>(new Map())
  const stopAnimation = useRef<(() => void) | null>(null)

  const setCardRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  // Resolve pointer Y to the nearest gap between cards and the line geometry.
  // Mirrors BlockReorderLayer: count the card midpoints above the pointer.
  const measure = useCallback((clientY: number) => {
    // Walk in the live (top-to-bottom) order so gaps match what the reader sees.
    const rects = orderedRects(cardRefs.current)
    if (rects.length === 0) return { gap: 0, indicator: null as Indicator | null }

    let gap = rects.length
    for (let i = 0; i < rects.length; i++) {
      const mid = rects[i].rect.top + rects[i].rect.height / 2
      if (clientY < mid) {
        gap = i
        break
      }
    }

    const left = rects[0].rect.left
    const width = rects[0].rect.width
    let top: number
    if (gap === 0) top = rects[0].rect.top
    else if (gap >= rects.length) top = rects[rects.length - 1].rect.bottom
    else top = (rects[gap - 1].rect.bottom + rects[gap].rect.top) / 2

    return { gap, indicator: { top, left, width } }
  }, [])

  const endDrag = useCallback(() => {
    const cap = capture.current
    if (cap) {
      try {
        cap.el.releasePointerCapture(cap.pointerId)
      } catch {
        /* capture may already be gone */
      }
      capture.current = null
    }
    document.body.classList.remove('mn-reordering')
    setDraggingId(null)
    setIndicator(null)
  }, [])

  // Clean up any in-flight drag if the figure unmounts mid-gesture.
  useEffect(() => () => endDrag(), [endDrag])

  // Arrow moves and drag releases both update the ordered array. Measure
  // before/after card positions and let the shared CSS transition settle
  // every displaced card into its new slot.
  useLayoutEffect(() => {
    const elements = new Map<string, HTMLElement>()
    const tops = new Map<string, number>()
    for (const section of sections) {
      const el = cardRefs.current.get(section.id)
      if (!el) continue
      elements.set(section.id, el)
      tops.set(section.id, el.getBoundingClientRect().top)
    }
    if (previousTops.current.size > 0) {
      stopAnimation.current?.()
      stopAnimation.current = animateVerticalReorder(elements, previousTops.current)
    }
    previousTops.current = tops
  }, [sections])

  useEffect(
    () => () => {
      stopAnimation.current?.()
    },
    [],
  )

  function onPointerDown(section: Section, e: ReactPointerEvent<HTMLDivElement>) {
    // A plain primary-button press starts a drag. Presses on the arrow
    // buttons stay clicks, and Cmd/Ctrl presses fall through to the real
    // editor's reorder layer.
    if (!isSimActivate(e)) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const el = e.currentTarget
    try {
      el.setPointerCapture(e.pointerId)
      capture.current = { el, pointerId: e.pointerId }
    } catch {
      /* capture unsupported — drag still works via the captured handlers */
    }
    document.body.classList.add('mn-reordering')
    setDraggingId(section.id)
    const { gap, indicator: ind } = measure(e.clientY)
    dropGap.current = gap
    setIndicator(ind)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingId) return
    const { gap, indicator: ind } = measure(e.clientY)
    dropGap.current = gap
    setIndicator(ind)
  }

  function onPointerUp() {
    if (!draggingId) return
    const id = draggingId
    const gap = dropGap.current
    setSections((prev) => {
      const from = prev.findIndex((s) => s.id === id)
      if (from < 0) return prev
      const next = prev.slice()
      const [item] = next.splice(from, 1)
      const insertAt = gap > from ? gap - 1 : gap
      next.splice(insertAt, 0, item)
      return next
    })
    endDrag()
  }

  // ↑/↓ buttons: nudge a block one step. Disabled at the ends.
  function move(id: string, dir: -1 | 1) {
    setSections((prev) => {
      const i = prev.findIndex((s) => s.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      const [item] = next.splice(i, 1)
      next.splice(j, 0, item)
      return next
    })
  }

  return (
    <div style={{ fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      <p className="figure-hint" style={{ margin: '0 0 0.75rem' }}>
        {SIM_DRAG_LABEL} a section to reorder, or use the arrows
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {sections.map((section, idx) => {
          const dragging = draggingId === section.id
          return (
            <div
              key={section.id}
              ref={setCardRef(section.id)}
              className={dragging ? 'mn-dragging' : undefined}
              onPointerDown={(e) => onPointerDown(section, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={endDrag}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                background: 'var(--fig-bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.7rem 0.85rem',
                cursor: draggingId ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--heading-font)',
                    fontWeight: 700,
                    fontSize: '1rem',
                  }}
                >
                  {section.title}
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>
                  {section.line}
                </div>
              </div>
              <div className="mn-edit-move">
                <button
                  onClick={() => move(section.id, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${section.title} up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(section.id, 1)}
                  disabled={idx === sections.length - 1}
                  aria-label={`Move ${section.title} down`}
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {indicator && (
        <div
          className="mn-drop-indicator"
          style={{ top: indicator.top, left: indicator.left, width: indicator.width }}
        />
      )}
    </div>
  )
}

// Read live bounding rects in the cards' visual (top-to-bottom) order.
function orderedRects(
  map: Map<string, HTMLDivElement>,
): { id: string; rect: DOMRect }[] {
  const out: { id: string; rect: DOMRect }[] = []
  for (const [id, el] of map) out.push({ id, rect: el.getBoundingClientRect() })
  out.sort((a, b) => a.rect.top - b.rect.top)
  return out
}
