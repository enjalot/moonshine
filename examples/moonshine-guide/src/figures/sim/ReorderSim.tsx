import { useCallback, useId } from 'react'
import { translate, type Draggable } from 'dragology'
import type { FigureProps } from '../registry'
import DragFigure from '../drag/DragFigure'
import { each } from '../drag/each'
import { SIM_DRAG_LABEL } from './gesture'
import './sims.css'

// A pure, local-state simulation of moonshine's block reordering. The real
// BlockReorderLayer lets the author hold the modifier and drag a top-level
// block: it lifts and follows the pointer while the others slide apart to
// show where it lands, and releasing rewrites the markdown order. The open
// editor also exposes ↑/↓ buttons that nudge a block one step.
//
// Both are declarative dragging, as in the harness: the drag is
// d.closest(every order the card could end up in).withFloating(), and the
// arrows set the next order, which Dragology animates to. Cmd/Ctrl presses
// never reach it: the real editor's reorder layer takes those first.

type Section = { id: string; title: string; line: string }

const SECTIONS: Section[] = [
  { id: 's1', title: 'Introduction', line: 'Why the problem matters and what we will build.' },
  { id: 's2', title: 'The method', line: 'The core idea, stated once and precisely.' },
  { id: 's3', title: 'A worked example', line: 'The method applied end-to-end on real numbers.' },
  { id: 's4', title: 'Conclusion', line: 'What we learned and where it could go next.' },
]
const BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]))

const W = 560
const CARD = 62
const GAP = 10
const H = SECTIONS.length * (CARD + GAP) - GAP

type State = { order: string[] }

function moved(order: string[], id: string, to: number): State {
  const rest = order.filter((x) => x !== id)
  return { order: [...rest.slice(0, to), id, ...rest.slice(to)] }
}

export default function ReorderSim(_props: FigureProps) {
  const uid = useId().replace(/:/g, '')

  const draw = useCallback<Draggable<State>>(
    ({ state, d, setState, draggedId }) => (
      <g>
        {each(state.order, (id, idx) => {
          const s = BY_ID[id]
          const gid = `${uid}-${id}`
          const lifted = draggedId === gid
          return (
            <g
              id={gid}
              className="mn-sim-card"
              data-on={lifted ? 'lifted' : undefined}
              transform={translate(0, idx * (CARD + GAP))}
              dragologyZIndex={lifted ? '/1' : false}
              dragologyOnDrag={() => d.closest(state.order.map((_, j) => moved(state.order, id, j))).withFloating()}
              // Dragology waits to see if a press is a click only when the
              // dragged element has a click handler; without one the arrows
              // inside never get their clicks.
              onClick={() => undefined}
            >
              <rect className="mn-sim-card-box" width={W} height={CARD} rx={6} />
              <text className="mn-sim-card-title" x={14} y={25}>
                {s.title}
              </text>
              <text className="mn-sim-card-line" x={14} y={46}>
                {s.line}
              </text>
              {each([-1, 1] as const, (dir) => {
                const to = idx + dir
                const ok = to >= 0 && to < state.order.length
                return (
                  <g
                    className="mn-sim-card-move"
                    data-on={ok ? undefined : 'off'}
                    transform={translate(W - (dir < 0 ? 66 : 36), CARD / 2 - 13)}
                    role="button"
                    aria-label={`Move ${s.title} ${dir < 0 ? 'up' : 'down'}`}
                    onClick={ok ? () => setState(moved(state.order, id, to)) : undefined}
                  >
                    <rect width={26} height={26} rx={4} />
                    <text x={13} y={14} textAnchor="middle" dominantBaseline="central">
                      {dir < 0 ? '↑' : '↓'}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </g>
    ),
    [uid],
  )

  return (
    <div>
      <p className="figure-hint" style={{ margin: '0 0 0.75rem' }}>
        {SIM_DRAG_LABEL} a section to reorder, or use the arrows
      </p>
      <DragFigure
        draggable={draw}
        width={W}
        height={H}
        initialState={{ order: SECTIONS.map((s) => s.id) }}
        label="Four section cards in a column, which can be dragged into a new order."
      />
    </div>
  )
}
