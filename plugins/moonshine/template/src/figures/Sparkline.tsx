import { useMemo } from 'react'
import * as d3 from 'd3'
import type { FigureProps } from './registry'
import { num } from './lib/params'

// A small D3 example: a seeded random walk. The walk is seeded so every
// visitor (and every re-render) sees the same curve — an article's
// figures should be deterministic.

// Tweakable surface. Override per-instance from markdown:
//   :::figure{id=sparkline seed=7 n=120}
export const DEFAULTS = {
  seed: 0.42, // d3.randomLcg seed in [0, 1) — change for a different walk
  n: 60, // number of points
}

export default function Sparkline(props: FigureProps) {
  const seed = num(props.seed, DEFAULTS.seed)
  const n = num(props.n, DEFAULTS.n)
  const { line, points, w, h } = useMemo(() => buildPath(seed, n), [seed, n])
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="img"
      aria-label="Sparkline of a random walk wandering between 0 and 1."
      style={{ maxHeight: 120 }}
    >
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

function buildPath(seed: number, n: number) {
  const w = 600
  const h = 120
  const random = d3.randomLcg(seed)
  let v = 0.5
  const data = Array.from({ length: n }, (_, i) => {
    v += (random() - 0.5) * 0.1
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
