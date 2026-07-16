import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FigureProps } from '../registry'
import { num } from '../lib/params'
import { isSimActivate, SIM_GESTURE_LABEL } from './gesture'

// Self-contained SIMULATION of moonshine's figure "knob panel".
//
// A real figure exports a DEFAULTS object; directive attributes override
// them, and Cmd/Ctrl+clicking the figure opens a generated panel of
// controls. Dragging a slider updates the figure live, and "Save to
// markdown" writes only the values that DIFFER from the defaults back
// into the directive's attribute string. The panel INSIDE this figure is
// local state, but the figure itself also plays the real game: its
// DEFAULTS/PARAM_HINTS are registered in registry.ts, and any attribute
// on its `:::figure{id=knobs …}` directive arrives here as a prop and
// seeds the sim. Cmd/Ctrl+click it during dev to open the real panel on
// top of the simulated one.

// The figure's tweakable surface. In the real system this lives at the
// top of the figure file and the registry points at it.
const DEFAULTS = {
  amplitude: 1,
  frequency: 3,
  phase: 0,
}

type Params = typeof DEFAULTS
type ParamKey = keyof Params

// Per-parameter slider bounds (a real figure's PARAM_HINTS; registered
// in registry.ts so the real knob panel uses the same bounds).
const PARAM_HINTS: Record<ParamKey, { min: number; max: number; step: number }> = {
  amplitude: { min: 0, max: 2, step: 0.1 },
  frequency: { min: 1, max: 8, step: 1 },
  phase: { min: 0, max: 6.28, step: 0.1 },
}

const FIG_ID = 'wave'

// Trim trailing zeros so 1.40 → "1.4" and 3.0 → "3", matching how the
// real serializer writes compact attribute values.
function fmt(n: number): string {
  return Number(n.toFixed(2)).toString()
}

// Build the markdown directive, including ONLY params that differ from
// the defaults — the exact behavior of the real "Save to markdown".
function directiveString(params: Params): string {
  const overrides = (Object.keys(DEFAULTS) as ParamKey[])
    .filter((k) => params[k] !== DEFAULTS[k])
    .map((k) => `${k}=${fmt(params[k])}`)
  const attrs = [`id=${FIG_ID}`, ...overrides].join(' ')
  return `:::figure{${attrs}}`
}

// The deterministic figure: an SVG sine curve driven by the params.
function WaveCurve({ params }: { params: Params }) {
  const W = 640
  const H = 180
  const mid = H / 2
  const path = useMemo(() => {
    const { amplitude, frequency, phase } = params
    const steps = 160
    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = t * W
      // amplitude scaled to ~70px peak; deterministic, no randomness.
      const y =
        mid - Math.sin(t * frequency * Math.PI * 2 + phase) * amplitude * 70
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    }
    return pts.join(' ')
  }, [params, mid])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <line
        x1={0}
        y1={mid}
        x2={W}
        y2={mid}
        stroke="var(--border)"
        strokeWidth={1}
      />
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function KnobsSim(props: FigureProps) {
  // Directive attributes become props: `:::figure{id=knobs frequency=4}`
  // arrives as props.frequency === "4" and seeds the sim's initial state.
  const [params, setParams] = useState<Params>(() => ({
    amplitude: num(props.amplitude, DEFAULTS.amplitude),
    frequency: num(props.frequency, DEFAULTS.frequency),
    phase: num(props.phase, DEFAULTS.phase),
  }))
  const [open, setOpen] = useState(false)
  const [committed, setCommitted] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const live = directiveString(params)

  // A plain click on the figure toggles the simulated knob panel;
  // Cmd/Ctrl+click passes through to the real one.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isSimActivate(e)) return
    e.preventDefault()
    setOpen((v) => !v)
  }, [])

  const setParam = useCallback((k: ParamKey, v: number) => {
    setParams((p) => ({ ...p, [k]: v }))
  }, [])

  const save = useCallback(() => {
    setCommitted(directiveString(params))
    setFlash(true)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(false), 1200)
  }, [params])

  const reset = useCallback(() => {
    setParams({ ...DEFAULTS })
  }, [])

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="mn-editable-figure"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label="Toggle the simulated parameter panel"
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        // Keyboard path: Enter/Space on the figure itself toggles the
        // panel. Keys inside the panel's inputs must not bubble-toggle.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setOpen((v) => !v)
        }
      }}
      style={{
        background: 'var(--fig-bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.75rem 0.9rem',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <WaveCurve params={params} />

      <p
        style={{
          margin: '0.4rem 0 0',
          fontFamily: 'var(--heading-font)',
          fontSize: '0.75rem',
          color: 'var(--text-2)',
          textAlign: 'center',
        }}
      >
        {SIM_GESTURE_LABEL} the figure to open its parameters
      </p>

      {open && (
        <div className="mn-knobs" onPointerDown={(e) => e.stopPropagation()}>
          <div className="mn-knobs-title">
            <code>{FIG_ID}</code>
            <div className="mn-knobs-controls">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close parameters"
              >
                ×
              </button>
            </div>
          </div>

          {(Object.keys(DEFAULTS) as ParamKey[]).map((k) => {
            const h = PARAM_HINTS[k]
            return (
              <div className="mn-knob" key={k}>
                <span className="mn-knob-name">{k}</span>
                <input
                  type="range"
                  min={h.min}
                  max={h.max}
                  step={h.step}
                  value={params[k]}
                  onChange={(e) => setParam(k, Number(e.target.value))}
                />
                <input
                  type="number"
                  min={h.min}
                  max={h.max}
                  step={h.step}
                  value={params[k]}
                  onChange={(e) => setParam(k, Number(e.target.value))}
                />
              </div>
            )
          })}

          <div
            style={{
              marginTop: '0.5rem',
              fontFamily: 'var(--mono-font)',
              fontSize: '0.72rem',
              color: 'var(--text)',
              background: 'var(--fig-bg)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '0.35rem 0.5rem',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {live}
          </div>

          <div className="mn-knobs-actions">
            <button type="button" onClick={save}>
              {flash ? 'saved ✓' : 'Save to markdown'}
            </button>
            <button type="button" onClick={reset}>
              Reset to defaults
            </button>
          </div>

          {committed && (
            <p
              style={{
                margin: '0.5rem 0 0',
                fontFamily: 'var(--heading-font)',
                fontSize: '0.72rem',
                color: 'var(--text-2)',
              }}
            >
              committed to markdown:{' '}
              <code
                style={{
                  fontFamily: 'var(--mono-font)',
                  color: 'var(--text)',
                }}
              >
                {committed}
              </code>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export { KnobsSim, DEFAULTS, PARAM_HINTS }
