import { useMemo, useState } from 'react'

// A heatmap of a synthetic two-well loss surface with a draggable
// starting point that traces a gradient-descent path.
//
// Earlier draft used scattered contour points emitted as `M x,y M x,y`
// — which renders nothing because each M is a move-to with no draw.
// A coarse heatmap of rect cells is both simpler and clearer: dark
// cells are low loss (valleys), light cells are high loss (peaks).
export default function LossLandscape() {
  const [start, setStart] = useState<[number, number]>([0.7, 0.45])
  const cells = useMemo(() => buildHeatmap(), [])
  const path = useMemo(() => descend(start), [start])

  const w = 480
  const h = 320
  const sx = (x: number) => ((x + 1) / 2) * w
  const sy = (y: number) => ((y + 1) / 2) * h

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      style={{ maxHeight: 320, cursor: 'crosshair', borderRadius: 4 }}
      onPointerDown={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const y = ((e.clientY - rect.top) / rect.height) * 2 - 1
        setStart([x, y])
      }}
    >
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={c.w + 0.5}
          height={c.h + 0.5}
          fill={lossColor(c.v)}
        />
      ))}

      <path
        d={path
          .map(
            ([x, y], i) => `${i === 0 ? 'M' : 'L'} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`,
          )
          .join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle
        cx={sx(start[0])}
        cy={sy(start[1])}
        r={6}
        fill="var(--accent)"
        stroke="white"
        strokeWidth={2}
      />

      <text
        x={12}
        y={h - 14}
        fontFamily="var(--heading-font)"
        fontSize={12}
        fill="white"
        opacity={0.85}
      >
        click anywhere to move the starting point
      </text>
    </svg>
  )
}

function loss(x: number, y: number) {
  return (
    1 -
    Math.exp(-((x + 0.6) ** 2 + y ** 2)) * 0.6 -
    Math.exp(-((x - 0.5) ** 2 + (y + 0.2) ** 2)) * 0.8
  )
}

function grad(x: number, y: number): [number, number] {
  const e = 0.001
  return [
    (loss(x + e, y) - loss(x - e, y)) / (2 * e),
    (loss(x, y + e) - loss(x, y - e)) / (2 * e),
  ]
}

function descend(initial: [number, number]): [number, number][] {
  let [x, y] = initial
  const path: [number, number][] = [[x, y]]
  const lr = 0.08
  for (let i = 0; i < 80; i++) {
    const [gx, gy] = grad(x, y)
    x -= lr * gx
    y -= lr * gy
    path.push([x, y])
    if (Math.hypot(gx, gy) < 0.005) break
  }
  return path
}

function buildHeatmap() {
  const w = 480
  const h = 320
  const cellsX = 60
  const cellsY = 40
  const cw = w / cellsX
  const ch = h / cellsY
  const cells: { x: number; y: number; w: number; h: number; v: number }[] = []
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const x = ((i + 0.5) / cellsX) * 2 - 1
      const y = ((j + 0.5) / cellsY) * 2 - 1
      cells.push({ x: i * cw, y: j * ch, w: cw, h: ch, v: loss(x, y) })
    }
  }
  return cells
}

// Map loss value (roughly [-0.4, 1]) to a gray scale:
// dark cells = low loss (valley), light cells = high loss (peak).
function lossColor(v: number) {
  const t = Math.max(0, Math.min(1, (v + 0.4) / 1.4))
  const lightness = 22 + t * 68
  return `hsl(220, 14%, ${lightness}%)`
}
