import { useCallback, useId } from 'react'
import { inOrder, param, translate, type Draggable } from 'dragology'
import type { FigureProps } from './registry'
import DragFigure from './drag/DragFigure'
import { each } from './drag/each'
import { num } from './lib/params'

// Gradient descent on a parabola, f(θ) = aθ², with the step size η on a
// ruler below. Three drags, each a one-line declaration (drag/README.md):
//
// - the η knob snaps to the four step sizes in the article's table and
//   slides freely between them: d.closest(detents).whenFar(d.vary(η));
// - the first step's dot varies η too, so a reader can grab where the
//   first step lands and drag it: Dragology finds the η that puts it there;
// - the start point varies θ₀.
//
// Every step is θ ← θ(1 − 2aη): below η = 1/(2a) the steps shrink toward
// the bottom, past it they overshoot and zig-zag, and past 1/a they grow.

// Tweakable surface. Override per-instance from markdown:
//   :::figure{id=step-size lr=0.45}
export const DEFAULTS = {
  lr: 0.12, // starting step size η
  start: -1, // starting θ₀, in [-1.2, 1.2]
  steps: 12, // how many steps to draw
}
export const PARAM_HINTS = {
  lr: { min: 0.005, max: 1, step: 0.005 },
  start: { min: -1.2, max: 1.2, step: 0.05 },
}

// The table's step sizes, and what each does on this curve.
// The last two sit close on the log ruler, so their words lean apart.
const DETENTS = [
  { lr: 0.01, word: 'crawls', anchor: 'middle', dx: 0 },
  { lr: 0.12, word: 'converges', anchor: 'middle', dx: 0 },
  { lr: 0.45, word: 'oscillates', anchor: 'end', dx: 14 },
  { lr: 0.9, word: 'diverges', anchor: 'start', dx: -10 },
] as const
const A = 1.6 // curvature: one step lands exactly at the bottom when η = 1/(2a)
const W = 480
const H = 300
const PLOT = { x0: 40, x1: 440, top: 34, bottom: 186 }
const TMAX = 1.25
const sx = (t: number) => PLOT.x0 + ((t + TMAX) / (2 * TMAX)) * (PLOT.x1 - PLOT.x0)
const sy = (t: number) => PLOT.bottom - ((A * t * t) / (A * TMAX * TMAX)) * (PLOT.bottom - PLOT.top)
// The ruler is logarithmic in η.
const RULER = { x0: 48, x1: 432, y: 236 }
const U0 = Math.log10(0.005)
const U1 = 0
const rx = (u: number) => RULER.x0 + ((u - U0) / (U1 - U0)) * (RULER.x1 - RULER.x0)

type State = { u: number; t0: number }

export default function StepSize(props: FigureProps) {
  const lr = num(props.lr, DEFAULTS.lr)
  const start = num(props.start, DEFAULTS.start)
  const steps = num(props.steps, DEFAULTS.steps)
  const uid = useId().replace(/:/g, '')

  const draw = useCallback<Draggable<State>>(
    ({ state, d }) => {
      const eta = 10 ** state.u
      const factor = 1 - 2 * A * eta
      // The iterates, until one leaves the chart.
      const pts: number[] = [state.t0]
      for (let i = 0; i < steps && Math.abs(pts[pts.length - 1]) <= TMAX; i++) pts.push(pts[pts.length - 1] * factor)
      const shown = pts.filter((t) => Math.abs(t) <= TMAX)
      const escaped = shown.length < pts.length
      const curve = Array.from({ length: 81 }, (_, i) => -TMAX + (i / 80) * 2 * TMAX)
      const varyEta = () => d.vary(state, param('u'), { constraint: (s) => inOrder([U0, s.u, U1]) })
      const outcome = Math.abs(factor) >= 1 ? 'diverges' : factor < 0 ? 'oscillates, then settles' : factor > 0.9 ? 'crawls' : 'converges'
      return (
        <g>
          <path className="mn-ss-curve" d={curve.map((t, i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(t).toFixed(1)}`).join('')} />
          <text className="mn-ss-note" transform={translate(PLOT.x1, 16)} textAnchor="end">
            {`each step: θ ← ${factor.toFixed(2)} θ · ${outcome}`}
          </text>
          {/* Hops between iterates, then the iterates. Steps past the
              first vary nothing; the first and the start are handles. */}
          <path
            className="mn-ss-hops"
            d={shown.map((t, i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(t).toFixed(1)}`).join('')}
          />
          {escaped && shown.length > 0 && (
            <text dragologyKey="escape" className="mn-ss-note" transform={translate(sx(shown[shown.length - 1]), sy(shown[shown.length - 1]) - 14)} textAnchor="middle">
              off the chart ↗
            </text>
          )}
          {each(shown.slice(2), (t, i) => (
            <circle id={`${uid}-it-${i + 2}`} className="mn-ss-iter" transform={translate(sx(t), sy(t))} r={3.5} />
          ))}
          {shown.length > 1 && (
            <circle
              id={`${uid}-first`}
              className="mn-ss-handle"
              transform={translate(sx(shown[1]), sy(shown[1]))}
              r={6}
              dragologyOnDrag={varyEta}
            />
          )}
          <circle
            id={`${uid}-start`}
            className="mn-ss-start"
            transform={translate(sx(state.t0), sy(state.t0))}
            r={7}
            dragologyOnDrag={() => d.vary(state, param('t0'), { constraint: (s) => inOrder([-1.2, s.t0, 1.2]) })}
          />

          {/* The η ruler. */}
          <line className="mn-ss-ruler" x1={RULER.x0} x2={RULER.x1} y1={RULER.y} y2={RULER.y} />
          {each(DETENTS, (det) => (
            <g transform={translate(rx(Math.log10(det.lr)), RULER.y)}>
              <line className="mn-ss-tick" y1={-6} y2={6} />
              <text className="mn-ss-tick-label" y={22} textAnchor="middle">
                {String(det.lr)}
              </text>
              <text className="mn-ss-tick-word" x={det.dx} y={38} textAnchor={det.anchor}>
                {det.word}
              </text>
            </g>
          ))}
          <g
            id={`${uid}-knob`}
            className="mn-ss-knob"
            transform={translate(rx(state.u), RULER.y)}
            dragologyOnDrag={() =>
              // Snap to the table's step sizes within 10px of one;
              // anywhere else, slide.
              d
                .closest(DETENTS.map((det) => ({ ...state, u: Math.log10(det.lr) })))
                .whenFar(varyEta(), { gap: 10 })
            }
          >
            <circle r={8} />
            <text y={-15} textAnchor="middle">
              {`η = ${eta < 0.1 ? eta.toFixed(3) : eta.toFixed(2)}`}
            </text>
          </g>
        </g>
      )
    },
    [steps, uid],
  )

  return (
    <>
      <DragFigure
        // Remount when the directive's values change (knob panel, markdown).
        key={`${lr}|${start}`}
        draggable={draw}
        width={W}
        height={H}
        initialState={{ u: Math.log10(Math.min(1, Math.max(0.005, lr))), t0: start }}
        label="A parabola with gradient descent steps zig-zagging toward its bottom, and a step-size ruler below with marks at 0.01, 0.12, 0.45 and 0.9."
        className="mn-step-size"
      />
      <p className="figure-hint">drag η along the ruler, or grab the first step and pull it · drag the start</p>
    </>
  )
}
