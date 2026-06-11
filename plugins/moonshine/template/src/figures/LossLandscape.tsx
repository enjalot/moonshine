import { useMemo, useRef, useState } from 'react'
import type { FigureProps } from './registry'
import { loss, grad } from './lib/lossSurface'
import { num } from './lib/params'

// A heatmap of a synthetic two-well loss surface with a draggable
// starting point that traces a gradient-descent path.
//
// Earlier draft used scattered contour points emitted as `M x,y M x,y`
// — which renders nothing because each M is a move-to with no draw.
// A coarse heatmap of rect cells is both simpler and clearer: dark
// cells are low loss (valleys), light cells are high loss (peaks).

// Tweakable surface. Override per-instance from markdown:
//   :::figure{id=loss-landscape lr=0.15 startX=-0.2}
export const DEFAULTS = {
  lr: 0.08, // gradient-descent step size (η)
  steps: 80, // max iterations before the path gives up
  startX: 0.7, // initial point, surface coords in [-1, 1]
  startY: 0.45,
}

export default function LossLandscape(props: FigureProps) {
  const lr = num(props.lr, DEFAULTS.lr)
  const steps = num(props.steps, DEFAULTS.steps)
  const [start, setStart] = useState<[number, number]>([
    num(props.startX, DEFAULTS.startX),
    num(props.startY, DEFAULTS.startY),
  ])
  const [dragging, setDragging] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const cells = useMemo(() => buildHeatmap(), [])
  const path = useMemo(() => descend(start, lr, steps), [start, lr, steps])

  const w = 480
  const h = 320
  const sx = (x: number) => ((x + 1) / 2) * w
  const sy = (y: number) => ((y + 1) / 2) * h

  // Map a pointer event to surface coordinates in [-1, 1]. Going through
  // the inverse screen CTM accounts for the letterboxing that
  // preserveAspectRatio adds when the element's box is wider than the
  // viewBox aspect — naive getBoundingClientRect math lands the point
  // tens of pixels off at article width.
  const toSurface = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const clamp = (v: number) => Math.max(-1, Math.min(1, v))
    return [clamp((pt.x / w) * 2 - 1), clamp((pt.y / h) * 2 - 1)]
  }

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        role="img"
        aria-label="Heatmap of a loss surface with two valleys. A movable starting point traces the path gradient descent takes downhill."
        style={{
          maxHeight: 320,
          cursor: dragging ? 'grabbing' : 'crosshair',
          borderRadius: 4,
          touchAction: 'none',
        }}
        onPointerDown={(e) => {
          const p = toSurface(e)
          if (!p) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          setStart(p)
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          const p = toSurface(e)
          if (p) setStart(p)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
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
          stroke="var(--fig-bg)"
          strokeWidth={2}
        />
      </svg>
      <p className="figure-hint">drag or click to move the starting point</p>
    </>
  )
}

function descend(
  initial: [number, number],
  lr: number,
  steps: number,
): [number, number][] {
  let [x, y] = initial
  const path: [number, number][] = [[x, y]]
  for (let i = 0; i < steps; i++) {
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
