type Props = {
  value?: string | number
  width?: string | number
  height?: string | number
}

// Tiny inline indicator showing a value in [0, 1] as a position on a
// short horizontal track. Sized to sit inline with body text.
export default function MiniSpark({ value = 0.5, width = 48, height = 14 }: Props) {
  const v = clamp01(typeof value === 'string' ? parseFloat(value) : value)
  const w = finiteOr(typeof width === 'string' ? parseFloat(width) : width, 48)
  const h = finiteOr(typeof height === 'string' ? parseFloat(height) : height, 14)
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      style={{ verticalAlign: 'middle' }}
      aria-label={`value ${v.toFixed(2)}`}
    >
      <line
        x1={2}
        y1={h / 2}
        x2={w - 2}
        y2={h / 2}
        stroke="var(--border)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={2 + v * (w - 4)} cy={h / 2} r={3} fill="var(--accent)" />
    </svg>
  )
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

function finiteOr(x: number, fallback: number) {
  return Number.isFinite(x) && x > 0 ? x : fallback
}
