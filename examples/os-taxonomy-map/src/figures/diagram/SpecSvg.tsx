import type { Box, DiagramSpec, NodeKind } from './spec'
import { edgeKey } from './spec'
import type { Placement } from './layout'

// Plain-SVG rendering of a spec at given positions. Readers see this when
// the author has not arranged the diagram yet, or when the spec changed
// since the last save (the author's saved positions still apply). It uses
// the article's color tokens, so it follows light/dark mode on its own.

const MARGIN = 12

function clipToBox(from: Box, to: Box): [number, number, number, number] {
  const cx = from.x + from.w / 2
  const cy = from.y + from.h / 2
  const tx = to.x + to.w / 2
  const ty = to.y + to.h / 2
  const edge = (b: Box, ox: number, oy: number, dx: number, dy: number) => {
    // Distance along (dx, dy) from the center of b to its border.
    const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx)
    const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy)
    const s = Math.min(sx, sy)
    return [ox + dx * s, oy + dy * s] as const
  }
  const dx = tx - cx
  const dy = ty - cy
  const [x1, y1] = edge(from, cx, cy, dx, dy)
  const [x2, y2] = edge(to, tx, ty, -dx, -dy)
  return [x1, y1, x2, y2]
}

function crosses(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  // Sample the segment; boxes are large relative to the step, so this is
  // plenty for editorial diagrams.
  for (let t = 0.05; t < 0.96; t += 0.05) {
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t
    if (x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < b.y + b.h + 4) return true
  }
  return false
}

// Straight line between box borders, unless it would run through another
// node; then a curve that detours around the row (below for left-to-right
// flows, to the right for top-to-bottom ones).
function route(a: Box, b: Box, all: Box[], dir: 'RIGHT' | 'DOWN') {
  const [x1, y1, x2, y2] = clipToBox(a, b)
  const others = all.filter((o) => o !== a && o !== b)
  if (!others.some((o) => crosses(x1, y1, x2, y2, o))) {
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2, maxX: -Infinity, maxY: -Infinity }
  }
  if (dir === 'RIGHT') {
    const sx = a.x + a.w / 2
    const tx = b.x + b.w / 2
    const sy = a.y + a.h
    const ty = b.y + b.h
    const lo = Math.min(sx, tx)
    const hi = Math.max(sx, tx)
    const under = all.filter((o) => o.x + o.w > lo && o.x < hi)
    const y = Math.max(sy, ty, ...under.map((o) => o.y + o.h)) + 28
    return { d: `M ${sx} ${sy} C ${sx} ${y}, ${tx} ${y}, ${tx} ${ty + 2}`, lx: (sx + tx) / 2, ly: y - 2, maxX: -Infinity, maxY: y }
  }
  const sy = a.y + a.h / 2
  const ty = b.y + b.h / 2
  const sx = a.x + a.w
  const tx = b.x + b.w
  const lo = Math.min(sy, ty)
  const hi = Math.max(sy, ty)
  const beside = all.filter((o) => o.y + o.h > lo && o.y < hi)
  const x = Math.max(sx, tx, ...beside.map((o) => o.x + o.w)) + 28
  return { d: `M ${sx} ${sy} C ${x} ${sy}, ${x} ${ty}, ${tx + 2} ${ty}`, lx: x, ly: (sy + ty) / 2, maxX: x, maxY: -Infinity }
}

function NodeShape({ kind, box, active }: { kind: NodeKind; box: Box; active: boolean }) {
  const common = {
    strokeWidth: active ? 2 : 1.25,
    stroke: active ? 'var(--accent)' : kind === 'external' || kind === 'data' ? 'var(--text-2)' : 'var(--text)',
  }
  const fill =
    active ? 'var(--accent-light)'
    : kind === 'accent' ? 'var(--accent-light)'
    : kind === 'note' ? 'var(--note-fill, #fdf6d8)'
    : 'var(--fig-bg)'
  const { x, y, w, h } = box
  switch (kind) {
    case 'decision':
      return (
        <polygon
          points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
          fill={fill}
          {...common}
        />
      )
    case 'store':
      return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} {...common} />
    case 'external':
      return <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} strokeDasharray="2 3" {...common} />
    case 'data':
      return <rect x={x} y={y} width={w} height={h} rx={3} fill={fill} strokeDasharray="5 3" {...common} />
    default:
      return <rect x={x} y={y} width={w} height={h} rx={5} fill={fill} {...common} />
  }
}

export default function SpecSvg({
  spec,
  placement,
  activePart,
}: {
  spec: DiagramSpec
  placement: Placement
  activePart?: string | null
}) {
  const boxes = [...Object.values(placement.nodes), ...Object.values(placement.groups)]
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map((b) => b.x)) - MARGIN
  const y0 = Math.min(...boxes.map((b) => b.y)) - MARGIN
    const nodeBoxes = Object.values(placement.nodes)
  const routes = new Map(
    spec.edges.flatMap((e) => {
      const a = placement.nodes[e.from]
      const b = placement.nodes[e.to]
      return a && b ? [[edgeKey(e), route(a, b, nodeBoxes, spec.direction ?? 'RIGHT')] as const] : []
    }),
  )
  const rs = [...routes.values()]
  const x1 = Math.max(...boxes.map((b) => b.x + b.w), ...rs.map((r) => r.maxX)) + MARGIN
  const y1 = Math.max(...boxes.map((b) => b.y + b.h), ...rs.map((r) => r.maxY)) + MARGIN
  const w = x1 - x0
  const h = y1 - y0
  const markerId = `mn-arrow-${Math.round(w)}-${Math.round(h)}`

  return (
    <svg
      className="mn-diagram-spec"
      viewBox={`${x0} ${y0} ${w} ${h}`}
      style={{ width: '100%', maxWidth: w, height: 'auto', display: 'block', margin: '0 auto' }}
      role="img"
      aria-label={spec.nodes.map((n) => n.label).join(', ')}
    >
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-2)" />
        </marker>
      </defs>
      {(spec.groups ?? []).map((g) => {
        const b = placement.groups[g.id]
        if (!b) return null
        const active = activePart === g.id
        return (
          <g key={g.id}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={6}
              fill="none"
              stroke={active ? 'var(--accent)' : 'var(--border)'}
              strokeWidth={active ? 2 : 1.5}
            />
            <text
              x={b.x + 12}
              y={b.y + 22}
              fontFamily="var(--heading-font)"
              fontSize={13}
              fontWeight={600}
              fill="var(--text-2)"
            >
              {g.label}
            </text>
          </g>
        )
      })}
      {spec.edges.map((e) => {
        const key = edgeKey(e)
        const r = routes.get(key)
        if (!r) return null
        const active = activePart === key
        const { d, lx, ly } = r
        return (
          <g key={key}>
            <path
              d={d}
              fill="none"
              stroke={active ? 'var(--accent)' : 'var(--text-2)'}
              strokeWidth={active ? 2 : 1.25}
              strokeDasharray={e.dashed ? '5 4' : undefined}
              markerEnd={`url(#${markerId})`}
            />
            {e.label && (
              <text
                x={lx}
                y={ly - 6}
                textAnchor="middle"
                fontFamily="var(--heading-font)"
                fontSize={12}
                fill="var(--text-2)"
                paintOrder="stroke"
                stroke="var(--fig-bg)"
                strokeWidth={4}
              >
                {e.label}
              </text>
            )}
          </g>
        )
      })}
      {spec.nodes.map((n) => {
        const b = placement.nodes[n.id]
        if (!b) return null
        const lines = n.label.split('\n')
        return (
          <g key={n.id}>
            <NodeShape kind={n.kind ?? 'process'} box={b} active={activePart === n.id} />
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h / 2 - ((lines.length - 1) * 18) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="var(--heading-font)"
              fontSize={15}
              fontWeight={500}
              fill="var(--text)"
            >
              {lines.map((l, i) => (
                <tspan key={i} x={b.x + b.w / 2} dy={i === 0 ? 0 : 18}>
                  {l}
                </tspan>
              ))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
