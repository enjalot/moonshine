import { useEffect, useState } from 'react'
import type { FigureProps } from '../registry'
import { useFigureHighlight } from '../../store'
// NOTE: the shared sim gesture helper is not needed here. Terms are inline
// buttons, so their gesture is already a plain hover/click.

// A pure, local-state simulation of moonshine's term → figure highlighting.
//
// The real feature: `:term[word]{to=figure-id.part}` turns a phrase into a
// quiet inline button. HOVER softly highlights the linked part (a glance);
// CLICK pins a strong highlight and scrolls the figure into view (a commit).
// Here everything is already on screen, so we simulate the "scroll into
// view" commit with a brief ring pulse around the pinned part.
//
// State mirrors the real two-tier model exactly: a transient `hovered` and a
// persistent `pinned`. No EditContext, no store, no network — local state.

type PartId = 'surface' | 'arrow' | 'step'

type Term = {
  id: PartId
  label: string
  // The markdown directive that produces this chip, shown to teach syntax.
  md: string
}

const TERMS: Term[] = [
  { id: 'surface', label: 'the surface', md: ':term[the surface]{to=descent.surface}' },
  { id: 'arrow', label: 'the gradient', md: ':term[the gradient]{to=descent.arrow}' },
  { id: 'step', label: 'the step', md: ':term[the step]{to=descent.step}' },
]

// Loss valley: high on the arms (small y), minimum at the bottom (large y).
const f = (x: number) => 60 + 110 * (1 - Math.pow((x - 180) / 140, 2))

// Current point on the left arm and where one descent step lands.
const CUR_X = 108
const NEXT_X = 150
const CUR_Y = f(CUR_X)
const NEXT_Y = f(NEXT_X)

// Bounding boxes (svg user units) for the pulse ring drawn on pin.
const PART_BOX: Record<PartId, { x: number; y: number; w: number; h: number }> = {
  surface: { x: 32, y: 52, w: 296, h: 130 },
  arrow: { x: CUR_X - 14, y: CUR_Y - 10, w: NEXT_X - CUR_X + 40, h: NEXT_Y - CUR_Y + 28 },
  step: {
    x: CUR_X - 14,
    y: Math.min(CUR_Y, NEXT_Y) - 14,
    w: NEXT_X - CUR_X + 28,
    h: Math.abs(NEXT_Y - CUR_Y) + 28,
  },
}

// Area path under the loss curve (for the shaded "surface" part).
function surfacePath(): string {
  const pts: string[] = []
  for (let x = 36; x <= 324; x += 6) pts.push(`${x},${f(x).toFixed(1)}`)
  return `M36,176 L${pts.join(' L')} L324,176 Z`
}

type PartState = 'pinned' | 'hovered' | null

export default function TermsSim({ figureId }: FigureProps) {
  const [hovered, setHovered] = useState<PartId | null>(null)
  const [pinned, setPinned] = useState<PartId | null>(null)
  // Bumped on every pin so the ring pulse re-triggers its CSS animation.
  const [pulseKey, setPulseKey] = useState(0)

  // This figure ALSO consumes the real term->figure store, so a live
  // `:term[...]{to=terms.arrow}` in the article prose highlights the same
  // parts the sim's own chips do. parseRef gives the dotted part id when
  // the active ref targets this figure.
  const { hoveredPart, pinnedPart } = useFigureHighlight(figureId)

  // Escape unpins — a small affordance that also gives us a listener to
  // clean up on unmount, matching the real "click away to release" feel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function togglePin(id: PartId) {
    setPinned((p) => (p === id ? null : id))
    setPulseKey((k) => k + 1)
  }

  // A part is lit when either the sim's own chips or a real :term in the
  // article body targets it. Pins win over hovers in both systems.
  const partState = (id: PartId): PartState =>
    pinned === id || pinnedPart === id
      ? 'pinned'
      : hovered === id || hoveredPart === id
        ? 'hovered'
        : null

  // Which markdown line is "active" — pin wins over hover, mirroring the SVG.
  const activeId =
    pinned ?? (pinnedPart as PartId | null | undefined) ?? hovered ?? (hoveredPart as PartId | null | undefined) ?? null

  // Stroke/fill helpers driven purely by part state.
  const strokeFor = (s: PartState, base: string) =>
    s === 'pinned' ? 'var(--accent)' : s === 'hovered' ? 'var(--accent)' : base
  const strokeW = (s: PartState, base: number) =>
    s === 'pinned' ? base + 1.5 : s === 'hovered' ? base + 0.75 : base
  const fillOpacity = (s: PartState) => (s === 'pinned' ? 0.45 : s === 'hovered' ? 0.22 : 0.08)

  const sSurface = partState('surface')
  const sArrow = partState('arrow')
  const sStep = partState('step')

  return (
    <div style={{ fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      {/* Scoped keyframes for the on-pin "scrolled into view" ring pulse. */}
      <style>{`
        @keyframes terms-sim-pulse {
          0%   { opacity: 0.9; transform: scale(1); }
          70%  { opacity: 0.25; }
          100% { opacity: 0; transform: scale(1.06); }
        }
        .terms-sim-pulse {
          fill: none;
          stroke: var(--accent);
          stroke-width: 2;
          transform-box: fill-box;
          transform-origin: center;
          animation: terms-sim-pulse 0.7s ease-out forwards;
        }
      `}</style>

      <p className="figure-hint" style={{ margin: '0 0 0.85rem' }}>
        Hover a term to glance, click to pin{pinned ? ' (Esc to release)' : ''}.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1.25rem',
          alignItems: 'flex-start',
        }}
      >
        {/* LEFT: prose with term chips + the markdown source. */}
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <p style={{ margin: '0 0 0.9rem', lineHeight: 1.6 }}>
            Gradient descent walks downhill. Read the slope of{' '}
            <TermChip term={TERMS[0]} state={sSurface} on={setHovered} pin={togglePin} />, follow{' '}
            <TermChip term={TERMS[1]} state={sArrow} on={setHovered} pin={togglePin} /> to learn
            which way is down, then take{' '}
            <TermChip term={TERMS[2]} state={sStep} on={setHovered} pin={togglePin} /> toward the
            minimum.
          </p>

          <div
            style={{
              background: 'var(--bg)',
              border: '1px dashed var(--border)',
              borderRadius: '6px',
              padding: '0.6rem 0.75rem',
              fontFamily: 'var(--mono-font)',
              fontSize: '0.72rem',
              lineHeight: 1.7,
            }}
          >
            {TERMS.map((t) => {
              const active = activeId === t.id
              return (
                <div
                  key={t.id}
                  style={{
                    color: active ? 'var(--accent)' : 'var(--text-2)',
                    background: active ? 'var(--accent-light)' : 'transparent',
                    borderRadius: '3px',
                    padding: '0 0.25rem',
                    opacity: active || !activeId ? 1 : 0.55,
                    transition: 'background 0.15s, color 0.15s, opacity 0.15s',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.md}
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT: the linked diagram with three addressable parts. */}
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <svg
            viewBox="0 0 360 220"
            width="100%"
            role="img"
            aria-label="A loss surface with a gradient arrow and a descent step"
            style={{ display: 'block', maxWidth: '360px', margin: '0 auto' }}
          >
            <defs>
              <marker
                id="terms-sim-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill={strokeFor(sArrow, 'var(--text-2)')} />
              </marker>
            </defs>

            {/* PART: surface — shaded valley region under the loss curve. */}
            <g id="descent.surface">
              <path
                d={surfacePath()}
                fill="var(--accent)"
                fillOpacity={fillOpacity(sSurface)}
                stroke={strokeFor(sSurface, 'var(--border)')}
                strokeWidth={strokeW(sSurface, 1.5)}
                style={{ transition: 'fill-opacity 0.15s, stroke 0.15s' }}
              />
              <text x="232" y="98" fontSize="11" fill="var(--text-2)">
                surface
              </text>
            </g>

            {/* PART: arrow — the gradient (descent direction). */}
            <g id="descent.arrow">
              <line
                x1={CUR_X}
                y1={CUR_Y}
                x2={CUR_X + 46}
                y2={CUR_Y + 30}
                stroke={strokeFor(sArrow, 'var(--text-2)')}
                strokeWidth={strokeW(sArrow, 2)}
                markerEnd="url(#terms-sim-arrow)"
                style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
              />
              <text x={CUR_X - 4} y={CUR_Y - 8} fontSize="11" fill="var(--text-2)">
                gradient
              </text>
            </g>

            {/* PART: step — the move from current point to the next. */}
            <g id="descent.step">
              <line
                x1={CUR_X}
                y1={CUR_Y}
                x2={NEXT_X}
                y2={NEXT_Y}
                stroke={strokeFor(sStep, 'var(--text-2)')}
                strokeWidth={strokeW(sStep, 2)}
                strokeDasharray="4 3"
                style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
              />
              <circle cx={CUR_X} cy={CUR_Y} r={4} fill="var(--text-2)" />
              <circle
                cx={NEXT_X}
                cy={NEXT_Y}
                r={sStep ? 6 : 5}
                fill={strokeFor(sStep, 'var(--accent)')}
                style={{ transition: 'r 0.15s, fill 0.15s' }}
              />
              <text x={NEXT_X + 6} y={NEXT_Y + 4} fontSize="11" fill="var(--text-2)">
                step
              </text>
            </g>

            {/* On-pin ring pulse = the "scrolled into view" commit affordance. */}
            {pinned && (
              <rect
                key={pulseKey}
                className="terms-sim-pulse"
                x={PART_BOX[pinned].x}
                y={PART_BOX[pinned].y}
                width={PART_BOX[pinned].w}
                height={PART_BOX[pinned].h}
                rx={6}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  )
}

// A single term chip. Plain hover/click — no modifier. Hover sets the
// transient highlight; click toggles the persistent pin.
function TermChip({
  term,
  state,
  on,
  pin,
}: {
  term: Term
  state: PartState
  on: (id: PartId | null) => void
  pin: (id: PartId) => void
}) {
  const cls =
    'term' + (state === 'pinned' ? ' term-pinned' : state === 'hovered' ? ' term-hovered' : '')
  return (
    <button
      type="button"
      className={cls}
      onMouseEnter={() => on(term.id)}
      onMouseLeave={() => on(null)}
      onFocus={() => on(term.id)}
      onBlur={() => on(null)}
      onClick={() => pin(term.id)}
      aria-pressed={state === 'pinned'}
      title="Hover to glance, click to pin"
    >
      {term.label}
    </button>
  )
}
