import { useState } from 'react'
import { useEdit } from '../lib/EditContext'
import type { ParamHint } from '../figures/registry'

// Dev-only parameter panel for a figure — the figure-side mirror of
// in-place prose editing. Controls are generated from the figure's
// registered DEFAULTS (slider+number for numbers, checkbox for booleans,
// text for strings). Changes apply to the live figure immediately;
// "Save to markdown" rewrites the directive's attributes in the .md
// through the same conflict-checked save path as prose edits, so the
// values land where both the author and the agent can see them.
//
// Only mounted from <Figure> when EDIT_ENABLED, so production builds
// tree-shake all of it.

type Props = {
  figureId: string
  defaults: Record<string, number | boolean | string>
  // Optional explicit slider bounds per parameter (figure's PARAM_HINTS).
  paramHints?: Record<string, ParamHint>
  // Attributes as currently written in the markdown directive (strings).
  attrs: Record<string, string>
  // Live override values keyed by param name (strings).
  overrides: Record<string, string>
  onChange: (key: string, value: string) => void
  onClose: () => void
  onSaved: () => void
  // Source offsets of the whole :::figure block in the article body.
  range: [number, number] | null
  // Reorder controls: move this figure up or down among top-level blocks.
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

export default function FigureKnobs({
  figureId,
  defaults,
  paramHints,
  attrs,
  overrides,
  onChange,
  onClose,
  onSaved,
  range,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: Props) {
  const { body, commitBody } = useEdit()
  const [saving, setSaving] = useState(false)

  const currentValue = (key: string): string =>
    overrides[key] ?? attrs[key] ?? String(defaults[key])

  const save = async () => {
    if (!range) {
      // eslint-disable-next-line no-alert
      window.alert('Could not locate this figure directive in the source.')
      return
    }
    setSaving(true)
    try {
      const slice = body.slice(range[0], range[1])
      const next = rewriteDirectiveAttrs(slice, buildAttrString())
      await commitBody(range[0], range[1], next)
      onSaved()
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(`Could not save: ${String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  // id first; unknown attributes (not in DEFAULTS) preserved verbatim;
  // params included only when they differ from the default, so the
  // markdown stays minimal and the DEFAULTS const remains the single
  // source of truth for untouched values.
  const buildAttrString = (): string => {
    const parts = [`id=${figureId}`]
    for (const [k, v] of Object.entries(attrs)) {
      if (!(k in defaults)) parts.push(`${k}=${quoteAttr(v)}`)
    }
    for (const k of Object.keys(defaults)) {
      const v = currentValue(k)
      if (v !== String(defaults[k])) parts.push(`${k}=${quoteAttr(v)}`)
    }
    return parts.join(' ')
  }

  // No stopPropagation here: the figure's own capture handler already
  // ignores clicks inside .mn-knobs, and a capture-phase stop at this
  // wrapper would prevent the click from ever reaching the panel's own
  // buttons (it stops the descent, not just the bubble).
  return (
    <div className="mn-knobs">
      <div className="mn-knobs-title">
        <span>
          <code>{figureId}</code> parameters
        </span>
        <span className="mn-knobs-controls">
          {(onMoveUp || onMoveDown) && (
            <span className="mn-edit-move">
              <button
                type="button"
                aria-label="Move figure up"
                title="Move figure up"
                onClick={() => onMoveUp?.()}
                disabled={saving || !canMoveUp}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move figure down"
                title="Move figure down"
                onClick={() => onMoveDown?.()}
                disabled={saving || !canMoveDown}
              >
                ↓
              </button>
            </span>
          )}
          <button type="button" aria-label="Close parameter panel" onClick={onClose}>
            ×
          </button>
        </span>
      </div>
      {Object.entries(defaults).map(([key, def]) => (
        <Knob
          key={key}
          name={key}
          def={def}
          hint={paramHints?.[key]}
          value={currentValue(key)}
          onChange={(v) => onChange(key, v)}
        />
      ))}
      <div className="mn-knobs-actions">
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save to markdown'}
        </button>
        <button
          type="button"
          onClick={() => {
            for (const [k, d] of Object.entries(defaults)) onChange(k, String(d))
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

function Knob({
  name,
  def,
  hint,
  value,
  onChange,
}: {
  name: string
  def: number | boolean | string
  hint?: ParamHint
  value: string
  onChange: (v: string) => void
}) {
  if (typeof def === 'boolean') {
    return (
      <label className="mn-knob">
        <span className="mn-knob-name">{name}</span>
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(String(e.target.checked))}
        />
      </label>
    )
  }
  if (typeof def === 'number') {
    const cur = Number(value)
    const { min, max, step } = sliderSpec(def, hint)
    return (
      <label className="mn-knob">
        <span className="mn-knob-name">{name}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(cur) ? Math.max(min, Math.min(max, cur)) : def}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="number"
          className="mn-knob-number"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }
  return (
    <label className="mn-knob">
      <span className="mn-knob-name">{name}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

// Slider bounds. Explicit PARAM_HINTS win field by field; otherwise the
// DEFAULT's order of magnitude decides: lr=0.08 → [0, 0.5] step 0.001;
// steps=80 → [0, 500] step 1. An integer default infers an integer step
// (rows=10 should slide 9, 10, 11 — not 10.3). Bounds must not depend on
// the current value — rescaling the track mid-drag moves the thumb under
// the pointer and feeds back until the value explodes. The number input
// alongside is unconstrained for values past the slider.
function sliderSpec(def: number, hint?: ParamHint) {
  const ref = Math.max(Math.abs(def), 1e-6)
  const mag = Math.pow(10, Math.ceil(Math.log10(ref)))
  let step = mag / 100
  if (Number.isInteger(def)) step = Math.max(1, step)
  const max = 5 * mag
  const min = def < 0 ? -max : 0
  return {
    min: hint?.min ?? min,
    max: hint?.max ?? max,
    step: hint?.step ?? step,
  }
}

// Replace (or insert) the attribute braces on the directive's first line,
// leaving the caption lines untouched.
function rewriteDirectiveAttrs(slice: string, attrString: string): string {
  const nl = slice.indexOf('\n')
  const first = nl === -1 ? slice : slice.slice(0, nl)
  const rest = nl === -1 ? '' : slice.slice(nl)
  const next = /\{[^}]*\}/.test(first)
    ? first.replace(/\{[^}]*\}/, `{${attrString}}`)
    : first.replace(/^(:{3,}\s*[\w-]+)/, `$1{${attrString}}`)
  return next + rest
}

// remark-directive attribute values take double quotes when they contain
// whitespace or syntax characters; quotes inside values are dropped (the
// panel's inputs are numbers and short labels, not prose).
function quoteAttr(value: string): string {
  const clean = value.replace(/["{}\n]/g, '')
  return /[\s='`]/.test(clean) ? `"${clean}"` : clean
}
