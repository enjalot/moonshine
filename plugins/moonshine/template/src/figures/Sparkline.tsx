import { useMemo } from 'react'
import * as d3 from 'd3'

// A small D3 example: a 60-point seeded random walk. Re-renders only when
// the component is mounted because the data is computed in `useMemo` with
// no deps — so HMR on this file gives a fresh curve on reload, which is
// useful when iterating on visual encoding.
export default function Sparkline() {
  const { line, points, w, h } = useMemo(() => buildPath(), [])
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxHeight: 120 }}>
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={3}
        fill="var(--accent)"
      />
    </svg>
  )
}

function buildPath() {
  const w = 600
  const h = 120
  const n = 60
  let v = 0.5
  const data = Array.from({ length: n }, (_, i) => {
    v += (Math.random() - 0.5) * 0.1
    v = Math.max(0, Math.min(1, v))
    return [i, v] as [number, number]
  })
  const x = d3.scaleLinear([0, n - 1], [10, w - 10])
  const y = d3.scaleLinear([0, 1], [h - 10, 10])
  const gen = d3
    .line<[number, number]>()
    .x((d) => x(d[0]))
    .y((d) => y(d[1]))
    .curve(d3.curveMonotoneX)
  const points = data.map((d) => [x(d[0]), y(d[1])] as [number, number])
  return { line: gen(data) ?? '', points, w, h }
}
