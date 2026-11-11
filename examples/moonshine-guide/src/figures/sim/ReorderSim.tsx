import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { translate, type Draggable } from 'dragology'
import type { FigureProps } from '../registry'
import DragFigure from '../drag/DragFigure'
import { each } from '../drag/each'
import { useWidth } from './useWidth'
import './sims.css'

// A local-state simulation of block reordering (BlockReorderLayer.tsx).
//
// What it keeps from the real thing:
// - the unit is a top-level block of the markdown body: a heading, a
//   paragraph, a whole `:::figure` with its caption, a `$$` math block. A
//   heading is its own block, so dragging it leaves its paragraphs behind;
// - the drag is the same one line, d.closest(every order).withFloating():
//   the grabbed block floats under the pointer and the others slide apart;
// - blocks are measured in the page and drawn as HTML inside
//   <foreignObject>, each at its own height;
// - dropping rewrites the markdown, shown beside the page.
//
// What it changes: the harness wants Cmd/Ctrl held while dragging (a plain
// drag on an article selects text), and its ↑/↓ buttons live on the open
// editor and the knob panel. Here a plain drag works, and ↑/↓ on a focused
// block stand in for those buttons.

type Block = { id: string; kind: 'heading' | 'text' | 'figure' | 'math'; source: string }

const BLOCKS: Block[] = [
  { id: 'h', kind: 'heading', source: '## Following the slope' },
  { id: 'p1', kind: 'text', source: 'The gradient points uphill, so each step moves against it.' },
  { id: 'fig', kind: 'figure', source: ':::figure{id=descent}\nOne step downhill.\n:::' },
  { id: 'eq', kind: 'math', source: '$$\n\\theta \\leftarrow \\theta - \\eta \\nabla f\n$$' },
  { id: 'p2', kind: 'text', source: 'A step that is too large jumps past the minimum.' },
]
const BY_ID = Object.fromEntries(BLOCKS.map((b) => [b.id, b]))
const NAME: Record<Block['kind'], string> = { heading: 'Heading', text: 'Paragraph', figure: 'Figure', math: 'Equation' }

const GAP = 8

// One block as the page renders it.
function BlockBody({ block }: { block: Block }) {
  if (block.kind === 'heading') return <div className="mn-sim-block mn-sim-block-heading">{block.source.replace(/^#+\s*/, '')}</div>
  if (block.kind === 'math') return <div className="mn-sim-block mn-sim-block-math">θ ← θ − η∇f</div>
  if (block.kind === 'figure') {
    return (
      <div className="mn-sim-block mn-sim-block-figure">
        <svg viewBox="0 0 200 64" width="200" height="64" aria-hidden>
          <path className="mn-sim-valley" d="M10,8 Q100,110 190,8" />
          <line className="mn-sim-hop" x1="46" y1="38" x2="74" y2="52" />
          <circle className="mn-sim-from" cx="46" cy="38" r="4" />
          <circle className="mn-sim-to" cx="74" cy="52" r="4.5" />
        </svg>
        <div className="mn-sim-block-caption">One step downhill.</div>
      </div>
    )
  }
  return <div className="mn-sim-block mn-sim-block-text">{block.source}</div>
}

// A block with its grip. The grip is HTML so that it can carry
// touch-action: none (see sims.css); it only shows for fingers.
function Slab({ block }: { block: Block }) {
  return (
    <div className="mn-sim-slab">
      <BlockBody block={block} />
      <div className="mn-sim-grip" aria-hidden />
    </div>
  )
}

function moveTo(order: string[], id: string, to: number): string[] {
  const rest = order.filter((x) => x !== id)
  return [...rest.slice(0, to), id, ...rest.slice(to)]
}

// The block whose move turns one order into the other.
function movedBlock(prev: string[], next: string[]): string | null {
  let best: string | null = null
  let far = 0
  for (const id of prev) {
    const same = prev.filter((x) => x !== id).join() === next.filter((x) => x !== id).join()
    const dist = Math.abs(prev.indexOf(id) - next.indexOf(id))
    if (same && dist > far) {
      best = id
      far = dist
    }
  }
  return best
}

type State = { order: string[] }

export default function ReorderSim(_props: FigureProps) {
  const uid = useId().replace(/:/g, '')
  const [pageRef, width] = useWidth<HTMLDivElement>()
  const measureRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<Record<string, number> | null>(null)
  const [order, setOrder] = useState(BLOCKS.map((b) => b.id))
  const [moved, setMoved] = useState<string | null>(null)

  // Measure every block at the page's width, as the real layer measures
  // the article's blocks when a drag starts.
  useLayoutEffect(() => {
    const host = measureRef.current
    if (!host || width === 0) return
    const read = () => {
      const next: Record<string, number> = {}
      Array.from(host.children).forEach((el, i) => {
        next[BLOCKS[i].id] = Math.ceil((el as HTMLElement).getBoundingClientRect().height)
      })
      setHeights(next)
    }
    read()
    // Web fonts change the line breaks.
    let live = true
    void document.fonts?.ready.then(() => live && read())
    return () => {
      live = false
    }
  }, [width])

  const apply = useCallback((next: string[]) => {
    setOrder((prev) => {
      const id = movedBlock(prev, next)
      if (id) setMoved(id)
      return next
    })
  }, [])

  const total = heights ? order.reduce((sum, id) => sum + heights[id], 0) + GAP * (order.length - 1) : 0

  const draw = useCallback<Draggable<State>>(
    ({ state, d, draggedId }) => {
      if (!heights) return <g />
      let y = 0
      return (
        <g>
          {each(state.order, (id, idx) => {
            const gid = `${uid}-${id}`
            const h = heights[id]
            const top = y
            y += h + GAP
            const lifted = draggedId === gid
            const block = BY_ID[id]
            return (
              <g
                id={gid}
                className="mn-sim-card"
                data-on={lifted ? 'lifted' : undefined}
                transform={translate(0, top)}
                dragologyZIndex={lifted ? '/1' : false}
                dragologyOnDrag={() => d.closest(state.order.map((_, j) => ({ order: moveTo(state.order, id, j) }))).withFloating()}
                tabIndex={0}
                role="listitem"
                // Constant per block: Dragology blends props between orders,
                // and cannot blend two different strings.
                aria-label={`${NAME[block.kind]} block. Arrow up and arrow down move it.`}
                onKeyDown={(e: React.KeyboardEvent) => {
                  const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
                  const to = idx + dir
                  if (!dir || to < 0 || to >= state.order.length) return
                  e.preventDefault()
                  apply(moveTo(state.order, id, to))
                }}
              >
                <rect className="mn-sim-card-box" width={width} height={h} rx={4} />
                <foreignObject width={width} height={h}>
                  <Slab block={block} />
                </foreignObject>
              </g>
            )
          })}
        </g>
      )
    },
    [uid, heights, width, apply],
  )

  return (
    <div className="mn-sim mn-reorder-sim">
      <p className="figure-hint">
        drag a block up or down, or focus one and press ↑ or ↓<span className="mn-sim-coarse"> · on a touch screen, drag by the dots</span>
      </p>
      <div className="mn-sim-split">
        <div>
          <div className="mn-sim-pane-name">the page</div>
          <div className="mn-sim-page" ref={pageRef} role="list" aria-label="Five blocks of an article, in their current order">
            <div className="mn-sim-measure" ref={measureRef} aria-hidden>
              {BLOCKS.map((b) => (
                <BlockBody key={b.id} block={b} />
              ))}
            </div>
            {heights && width > 0 && (
              <DragFigure
                draggable={draw}
                width={width}
                height={total}
                state={{ order }}
                onState={(s) => apply(s.order)}
                label="An article of five blocks: a heading, a paragraph, a figure, an equation and a second paragraph. Each can be moved up or down."
              />
            )}
          </div>
        </div>
        <div>
          <div className="mn-sim-pane-name">content/descent.md</div>
          <div className="mn-sim-source" aria-live="polite">
            {order.map((id) => (
              <pre key={id} data-on={moved === id ? 'moved' : undefined}>
                {BY_ID[id].source}
              </pre>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
