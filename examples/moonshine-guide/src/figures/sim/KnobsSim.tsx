import { useCallback, useId, useState } from 'react'
import { inOrder, param, translate, type Draggable } from 'dragology'
import type { FigureProps } from '../registry'
import DragFigure from '../drag/DragFigure'
import { num } from '../lib/params'
import { useFigureHighlight } from '../../store'
import { useWidth } from './useWidth'
import TouchPad from './TouchPad'
import './sims.css'

// A wave with three parameters, and a SIMULATION of the knob panel the
// harness generates for it.
//
// The figure itself is real. Its DEFAULTS and PARAM_HINTS are registered in
// registry.ts, so attributes on `:::figure{id=knobs …}` arrive as props, and
// during `npm run dev` Cmd/Ctrl+click opens the real panel under it. The
// crest is a declarative drag (drag/README.md, "drag an output"): the dot
// sits where the wave peaks, which is computed from amplitude and phase, and
// d.vary finds the amplitude and phase that put it under the pointer. As in
// the template's StepSize, a reader's drag stays inside the figure; only
// the panel writes to markdown.
//
// The panel drawn here imitates FigureKnobs.tsx with local state, because
// the real one does not exist in a static build: same controls, the same
// rule for what Save writes (only values that differ from DEFAULTS), and
// the same close behavior (× throws unsaved changes away, Save closes).

export const DEFAULTS = {
  amplitude: 1,
  frequency: 3,
  phase: 0,
}

type Params = typeof DEFAULTS
type ParamKey = keyof Params

// The magnitude heuristic would offer amplitude [0, 5] in steps of 0.01 and
// phase [0, 5] too; these are the ranges the drawing has room for.
export const PARAM_HINTS: Record<ParamKey, { min: number; max: number; step: number }> = {
  amplitude: { min: 0, max: 2, step: 0.1 },
  frequency: { min: 1, max: 8, step: 1 },
  phase: { min: 0, max: 6.28, step: 0.1 },
}

const KEYS = Object.keys(DEFAULTS) as ParamKey[]
const H = 190
const MID = H / 2
// Pixels per unit of amplitude: the largest amplitude (2) still fits.
const UNIT = 42
const TAU = Math.PI * 2

// Compact attribute values: 1.40 → "1.4", 3.0 → "3".
const fmt = (n: number) => String(Number(n.toFixed(2)))

// What Save writes: the id, then only the parameters that differ from
// DEFAULTS (FigureKnobs.buildAttrString).
function directive(id: string, p: Params): string {
  const changed = KEYS.filter((k) => p[k] !== DEFAULTS[k]).map((k) => `${k}=${fmt(p[k])}`)
  return `:::figure{${[`id=${id}`, ...changed].join(' ')}}`
}

type Wave = { amplitude: number; phase: number }

export default function KnobsSim(props: FigureProps) {
  const id = props.figureId
  const uid = useId().replace(/:/g, '')
  const [ref, width] = useWidth<HTMLDivElement>()
  const { activePart } = useFigureHighlight(id)

  // `saved` plays the markdown: it starts as the directive's real
  // attributes. `live` is what the open panel shows and the figure draws.
  const [saved, setSaved] = useState<Params>(() => ({
    amplitude: num(props.amplitude, DEFAULTS.amplitude),
    frequency: num(props.frequency, DEFAULTS.frequency),
    phase: num(props.phase, DEFAULTS.phase),
  }))
  const [live, setLive] = useState<Params>(saved)
  const [open, setOpen] = useState(true)
  const dirty = KEYS.some((k) => live[k] !== saved[k])

  const W = Math.max(240, width)
  const frequency = Math.max(0.5, live.frequency)
  const lit = activePart === 'crest'

  const draw = useCallback<Draggable<Wave>>(
    ({ state, d }) => {
      const y = (t: number) => MID - Math.sin(TAU * frequency * t + state.phase) * state.amplitude * UNIT
      const curve = Array.from({ length: 161 }, (_, i) => {
        const t = i / 160
        return `${i ? 'L' : 'M'}${(t * W).toFixed(1)},${y(t).toFixed(1)}`
      }).join('')
      // The crest that slides one period to the left as the phase runs
      // from 0 to 2π. At a very low frequency it would start off the
      // right edge, so take the crest before it.
      let t = (1.25 - state.phase / TAU) / frequency
      if (t > 0.96) t -= 1 / frequency
      const cx = t * W
      const cy = MID - state.amplitude * UNIT
      // Keep the readout on the drawing when the crest is near an edge.
      const dx = Math.max(64, Math.min(W - 64, cx)) - cx
      return (
        <g>
          <line className="mn-wave-axis" x1={0} x2={W} y1={MID} y2={MID} />
          <path className="mn-wave-curve" d={curve} />
          <line className="mn-wave-rise" transform={translate(cx, MID)} y2={cy - MID} />
          <g
            id={`${uid}-crest`}
            className="mn-wave-crest"
            data-on={lit ? 'active' : undefined}
            transform={translate(cx, cy)}
            dragologyOnDrag={() =>
              d
                .vary(state, [param('amplitude'), param('phase')], {
                  constraint: (s) => [...inOrder([0.1, s.amplitude, 2]), ...inOrder([0, s.phase, 6.28])],
                })
                // Land on the values the panel's sliders can show.
                .onDrop((s) => ({ amplitude: Math.round(s.amplitude * 10) / 10, phase: Math.round(s.phase * 10) / 10 }))
            }
          >
            <circle className="mn-wave-ring" r={15} />
            <circle className="mn-wave-dot" r={8} />
            {/* A finger-sized HTML pad over the dot: see .mn-sim-touchpad. */}
            <foreignObject transform={translate(-22, -22)} width={44} height={44}>
              <TouchPad />
            </foreignObject>
            <text x={dx} y={-18} textAnchor="middle">
              {`A = ${state.amplitude.toFixed(1)} · φ = ${state.phase.toFixed(1)}`}
            </text>
          </g>
        </g>
      )
    },
    [W, frequency, uid, lit],
  )

  const set = (k: ParamKey, v: number) => {
    if (Number.isFinite(v)) setLive((p) => ({ ...p, [k]: v }))
  }

  return (
    <div className="mn-sim mn-knobs-sim" ref={ref}>
      {width > 0 && (
        <DragFigure
          // Start again from the panel's values whenever they change; the
          // reader's own drag holds until then.
          key={`${W}|${live.amplitude}|${live.frequency}|${live.phase}`}
          draggable={draw}
          width={W}
          height={H}
          initialState={{ amplitude: live.amplitude, phase: live.phase }}
          label={`A sine wave with amplitude ${fmt(live.amplitude)}, frequency ${fmt(live.frequency)} and phase ${fmt(live.phase)}. A dot marks one crest.`}
        />
      )}
      <p className="figure-hint">drag the crest: its height is the amplitude, its place along the wave is the phase</p>

      {open ? (
        <div className="mn-knobs" role="group" aria-label="Simulated parameter panel">
          <div className="mn-knobs-title">
            <span>
              <code>{id}</code> parameters
            </span>
            <span className="mn-knobs-controls">
              {/* The real panel's other controls. They act on the article,
                  so here they are shown and switched off. */}
              <span className="mn-edit-move mn-edit-move-figure">
                <button type="button" disabled aria-label="Move figure up" title="Move figure up (dev only)">
                  ↑
                </button>
                <button type="button" disabled aria-label="Move figure down" title="Move figure down (dev only)">
                  ↓
                </button>
              </span>
              <span className="mn-figure-controls">
                <button type="button" disabled title="Break out of the text column (dev only)">
                  Wide
                </button>
                <button type="button" disabled title="Delete this figure (dev only)">
                  Delete
                </button>
              </span>
              <button type="button" className="mn-edit-comment" disabled aria-label="Comment to the agent" title="Comment to the agent (dev only)">
                💬
              </button>
              <button
                type="button"
                aria-label="Close parameter panel and discard unsaved values"
                onClick={() => {
                  setLive(saved)
                  setOpen(false)
                }}
              >
                ×
              </button>
            </span>
          </div>

          {KEYS.map((k) => {
            const h = PARAM_HINTS[k]
            return (
              <label className="mn-knob" key={k}>
                <span className="mn-knob-name">{k}</span>
                <input
                  type="range"
                  min={h.min}
                  max={h.max}
                  step={h.step}
                  value={Math.max(h.min, Math.min(h.max, live[k]))}
                  onChange={(e) => set(k, Number(e.target.value))}
                />
                {/* Unbounded, as in the real panel: for values past the slider. */}
                <input type="number" className="mn-knob-number" step={h.step} value={live[k]} onChange={(e) => set(k, Number(e.target.value))} />
              </label>
            )
          })}

          <div className="mn-knobs-actions">
            <button
              type="button"
              onClick={() => {
                setSaved(live)
                setOpen(false)
              }}
            >
              Save to markdown
            </button>
            <button type="button" onClick={() => setLive({ ...DEFAULTS })}>
              Reset to defaults
            </button>
          </div>
        </div>
      ) : (
        <div className="mn-knobs-actions mn-sim-reopen">
          <button type="button" onClick={() => setOpen(true)}>
            Open the parameters
          </button>
        </div>
      )}

      <div className="mn-sim-file" aria-live="polite">
        <span className="mn-sim-pane-name">guide.md{dirty ? ' · Save would write' : ''}</span>
        <code data-on={dirty ? 'changed' : undefined}>{directive(id, dirty ? live : saved)}</code>
      </div>
    </div>
  )
}
