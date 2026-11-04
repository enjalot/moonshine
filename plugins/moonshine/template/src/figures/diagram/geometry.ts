import { edgeKey, type Annotation, type BakedDiagram, type Box, type DiagramSpec, type EdgeArrangement, type Pad, type Side } from './spec'

// Where things go: edge routes, the reader frame, bounds. Pure functions
// of boxes, shared by the reader (DiagramFigure), the editor
// (DiagramArrange) and the drawing (draw.tsx), so all three always agree.

type Pt = [number, number]

// The boxes a diagram is drawn from, by spec id.
export type Placed = {
  nodes: Record<string, Box>
  groups: Record<string, Box>
}

export function sidePoint(b: Box, s: Side): Pt {
  switch (s) {
    case 'top':
      return [b.x + b.w / 2, b.y]
    case 'bottom':
      return [b.x + b.w / 2, b.y + b.h]
    case 'left':
      return [b.x, b.y + b.h / 2]
    case 'right':
      return [b.x + b.w, b.y + b.h / 2]
  }
}

const OUT: Record<Side, Pt> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }

// The side of `a` that faces `b`.
export function facing(a: Box, b: Box): Side {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) / (a.w + b.w) > Math.abs(dy) / (a.h + b.h)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}

// Where the line from a box's center toward (tx, ty) leaves the box.
export function borderPoint(b: Box, tx: number, ty: number): Pt {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = tx - cx
  const dy = ty - cy
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity, 1)
  return [cx + dx * s, cy + dy * s]
}

function crosses([x1, y1]: Pt, [x2, y2]: Pt, b: Box): boolean {
  for (let t = 0.06; t < 0.95; t += 0.04) {
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t
    if (x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2) return true
  }
  return false
}

export type EdgeGeom = {
  // Absolute SVG path (M / L / Q / C).
  path: string
  // The route sampled as a polyline, for placing the label along it.
  pts: Pt[]
  p1: Pt
  p2: Pt
  // Direction the arrow arrives in at p2, in radians.
  angle: number
  // Label position.
  lx: number
  ly: number
}

// How an edge is drawn between two boxes:
// - an end with an author-picked side leaves that side square, routed
//   orthogonally with rounded corners;
// - otherwise a straight line between the borders, bowed around any box it
//   would run through.
// `at` places the label along the route (0..1, default the middle).
export function edgeGeometry(
  a: Box,
  b: Box,
  arr: EdgeArrangement | undefined,
  direction: 'RIGHT' | 'DOWN',
  others: Box[],
): EdgeGeom {
  let g: Omit<EdgeGeom, 'lx' | 'ly'>
  if (arr?.source || arr?.target) {
    const ss = arr.source ?? facing(a, b)
    const ts = arr.target ?? facing(b, a)
    g = orthogonal(sidePoint(a, ss), ss, sidePoint(b, ts), ts)
  } else {
    const p1 = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2)
    const p2 = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2)
    if (!others.some((o) => crosses(p1, p2, o))) {
      g = { path: `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`, pts: [p1, p2], p1, p2, angle: Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) }
    } else if (direction === 'RIGHT') {
      // Bow under the row the straight line would have crossed.
      const sx = a.x + a.w / 2
      const tx = b.x + b.w / 2
      const lo = Math.min(sx, tx)
      const hi = Math.max(sx, tx)
      const floor = Math.max(a.y + a.h, b.y + b.h, ...others.filter((o) => o.x + o.w > lo && o.x < hi).map((o) => o.y + o.h))
      g = cubic([sx, a.y + a.h], [sx, floor + 28], [tx, floor + 28], [tx, b.y + b.h])
    } else {
      const sy = a.y + a.h / 2
      const ty = b.y + b.h / 2
      const lo = Math.min(sy, ty)
      const hi = Math.max(sy, ty)
      const wall = Math.max(a.x + a.w, b.x + b.w, ...others.filter((o) => o.y + o.h > lo && o.y < hi).map((o) => o.x + o.w))
      g = cubic([a.x + a.w, sy], [wall + 28, sy], [wall + 28, ty], [b.x + b.w, ty])
    }
  }
  const [lx, ly] = pointAlong(g.pts, arr?.labelAt ?? 0.5)
  return { ...g, lx, ly }
}

function cubic(p0: Pt, c1: Pt, c2: Pt, p3: Pt): Omit<EdgeGeom, 'lx' | 'ly'> {
  const pts: Pt[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const u = 1 - t
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
    ])
  }
  return {
    path: `M ${p0[0]} ${p0[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p3[0]} ${p3[1]}`,
    pts,
    p1: p0,
    p2: p3,
    angle: Math.atan2(p3[1] - c2[1], p3[0] - c2[0]),
  }
}

// An orthogonal route that leaves `s` going out of side `ss` and arrives
// at `t` coming in through side `ts`, with rounded corners.
const STUB = 18
const RADIUS = 8
function orthogonal(s: Pt, ss: Side, t: Pt, ts: Side): Omit<EdgeGeom, 'lx' | 'ly'> {
  const [ox, oy] = OUT[ss]
  const [ix, iy] = OUT[ts]
  const a: Pt = [s[0] + ox * STUB, s[1] + oy * STUB]
  const b: Pt = [t[0] + ix * STUB, t[1] + iy * STUB]
  const horizS = ox !== 0
  const horizT = ix !== 0
  let mid: Pt[]
  if (horizS && horizT) {
    const mx = (a[0] + b[0]) / 2
    // Going back on itself: cross over at mid-height instead.
    if ((mx - a[0]) * ox < 0 || (mx - b[0]) * ix < 0) {
      const my = (a[1] + b[1]) / 2
      mid = [[a[0], my], [b[0], my]]
    } else mid = [[mx, a[1]], [mx, b[1]]]
  } else if (!horizS && !horizT) {
    const my = (a[1] + b[1]) / 2
    if ((my - a[1]) * oy < 0 || (my - b[1]) * iy < 0) {
      const mx = (a[0] + b[0]) / 2
      mid = [[mx, a[1]], [mx, b[1]]]
    } else mid = [[a[0], my], [b[0], my]]
  } else if (horizS) {
    // Out sideways, in vertically: one corner if it lies ahead of both.
    const c: Pt = [b[0], a[1]]
    mid = (c[0] - a[0]) * ox >= 0 && (c[1] - b[1]) * iy >= 0 ? [c] : [[a[0], b[1]]]
  } else {
    const c: Pt = [a[0], b[1]]
    mid = (c[1] - a[1]) * oy >= 0 && (c[0] - b[0]) * ix >= 0 ? [c] : [[b[0], a[1]]]
  }
  const pts = simplify([s, a, ...mid, b, t])
  return { path: rounded(pts), pts, p1: s, p2: t, angle: Math.atan2(-iy, -ix) }
}

// Drop repeated and collinear points.
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) continue
    const r = out[out.length - 2]
    if (q && r && Math.abs((q[0] - r[0]) * (p[1] - q[1]) - (q[1] - r[1]) * (p[0] - q[0])) < 0.01) out.pop()
    out.push(p)
  }
  return out
}

function rounded(pts: Pt[]): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]
    const [x, y] = pts[i]
    const [nx, ny] = pts[i + 1]
    const r = Math.min(RADIUS, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2)
    const u = towards([x, y], [px, py], r)
    const v = towards([x, y], [nx, ny], r)
    d += ` L ${u[0]} ${u[1]} Q ${x} ${y}, ${v[0]} ${v[1]}`
  }
  const last = pts[pts.length - 1]
  return `${d} L ${last[0]} ${last[1]}`
}

function towards([x, y]: Pt, [tx, ty]: Pt, r: number): Pt {
  const l = Math.hypot(tx - x, ty - y) || 1
  return [x + ((tx - x) / l) * r, y + ((ty - y) / l) * r]
}

// The point a fraction `t` of the way along a polyline, by length.
export function pointAlong(pts: Pt[], t: number): Pt {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  let left = Math.max(0, Math.min(1, t)) * lens.reduce((s, l) => s + l, 0)
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, left / lens[i]) : 0
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]
    }
    left -= lens[i]
  }
  return pts[0]
}

// Every edge's geometry, by edge key; edges to missing nodes are skipped.
export function routeEdges(spec: DiagramSpec, placed: Placed, sides: BakedDiagram['edges']): Map<string, EdgeGeom> {
  const out = new Map<string, EdgeGeom>()
  const dir = spec.direction ?? 'RIGHT'
  for (const e of spec.edges) {
    const a = placed.nodes[e.from]
    const b = placed.nodes[e.to]
    if (!a || !b || e.from === e.to) continue
    const others = Object.entries(placed.nodes)
      .filter(([id]) => id !== e.from && id !== e.to)
      .map(([, o]) => o)
    out.set(edgeKey(e), edgeGeometry(a, b, sides?.[edgeKey(e)], dir, others))
  }
  return out
}

// ---- groups -------------------------------------------------------------

// Room inside a group around its boxes (the label sits in the top band).
export const GROUP_PAD = { top: 44, side: 24, bottom: 24 }

// A group is drawn around its members: its saved box, grown to hold them.
// `skip` leaves one node out, for asking "would this node be inside?"
// while that node is being dragged.
export function groupBox(spec: DiagramSpec, gid: string, nodes: Record<string, Box>, saved?: Box, skip?: string): Box | null {
  let box: Box | null = saved ?? null
  for (const n of spec.nodes) {
    if (n.group !== gid || n.id === skip) continue
    const m = nodes[n.id]
    if (!m) continue
    box = union(box, { x: m.x - GROUP_PAD.side, y: m.y - GROUP_PAD.top, w: m.w + 2 * GROUP_PAD.side, h: m.h + GROUP_PAD.top + GROUP_PAD.bottom })
  }
  return box
}

export function groupBoxes(spec: DiagramSpec, nodes: Record<string, Box>, saved?: Record<string, Box>): Record<string, Box> {
  const out: Record<string, Box> = {}
  for (const g of spec.groups ?? []) {
    const b = groupBox(spec, g.id, nodes, saved?.[g.id])
    if (b) out[g.id] = b
  }
  return out
}

export function union(a: Box | null, b: Box): Box {
  if (!a) return b
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

export const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h

// ---- the reader frame -----------------------------------------------------

// What readers see: the bounds of everything drawn (boxes, groups,
// annotations, arrows and their labels) plus the author's margin on each
// side. The editor draws the same frame, so it always matches. Margins
// can be negative, to crop. Saves from before framePad stored a fixed
// `frame` box; that still wins when present.
export const DEFAULT_PAD: Pad = { top: 16, right: 16, bottom: 16, left: 16 }

export function frameFor(spec: DiagramSpec, placed: Placed, baked: Pick<BakedDiagram, 'edges' | 'annotations' | 'framePad' | 'frame'> | null): Box {
  if (baked?.frame) return baked.frame
  return padBox(contentBounds(spec, placed, baked), baked?.framePad ?? DEFAULT_PAD)
}

export function padBox(b: Box, p: Pad): Box {
  return { x: b.x - p.left, y: b.y - p.top, w: Math.max(40, b.w + p.left + p.right), h: Math.max(30, b.h + p.top + p.bottom) }
}

export function padBetween(content: Box, frame: Box): Pad {
  return {
    top: Math.round(content.y - frame.y),
    left: Math.round(content.x - frame.x),
    bottom: Math.round(frame.y + frame.h - (content.y + content.h)),
    right: Math.round(frame.x + frame.w - (content.x + content.w)),
  }
}

export function contentBounds(
  spec: DiagramSpec,
  placed: Placed,
  baked: { edges?: BakedDiagram['edges']; annotations?: Annotation[] } | null,
): Box {
  const boxes: Box[] = [...Object.values(placed.nodes), ...Object.values(placed.groups), ...(baked?.annotations ?? [])]
  const routes = routeEdges(spec, placed, baked?.edges)
  for (const e of spec.edges) {
    const g = routes.get(edgeKey(e))
    if (!g) continue
    boxes.push(pathBounds(g.pts))
    if (e.label) {
      const w = e.label.length * 7 + 14
      boxes.push({ x: g.lx - w / 2, y: g.ly - 10, w, h: 20 })
    }
  }
  if (!boxes.length) return { x: 0, y: 0, w: 100, h: 60 }
  return boxes.reduce<Box | null>((u, b) => union(u, b), null) as Box
}

// Bounds of a sampled route, with room for the arrowhead.
function pathBounds(pts: Pt[]): Box {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs) - 6
  const y0 = Math.min(...ys) - 6
  return { x: x0, y: y0, w: Math.max(...xs) + 6 - x0, h: Math.max(...ys) + 6 - y0 }
}
