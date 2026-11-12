import { edgeKey, type Annotation, type BakedDiagram, type Box, type DiagramSpec, type Pad, type Side, type SpecEdge } from './spec'
import { edgeLabelWidth } from './text'
import { nodeExtent, tileLabelBox } from './tile'

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

// Where the line from a box's center toward (tx, ty) leaves the box.
export function borderPoint(b: Box, tx: number, ty: number): Pt {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = tx - cx
  const dy = ty - cy
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity, 1)
  return [cx + dx * s, cy + dy * s]
}

export type EdgeGeom = {
  // Absolute SVG path for the line; it stops short of p2, under the
  // arrowhead, so the line never pokes through the arrow's tip.
  path: string
  // The route as a polyline, from p1 to p2.
  pts: Pt[]
  p1: Pt
  p2: Pt
  // Direction the arrow arrives in at p2, in radians.
  angle: number
  // Direction a start arrowhead points in at p1 (back out of the route).
  angle1: number
  // Label position, and how far along the route it is (0..1). When the run
  // it sits on is too short to show on both sides of the label, the label
  // is moved beside the line so it never hides its own link.
  lx: number
  ly: number
  at: number
  // Which way the link travels where the label sits: an axis unit vector.
  ldir: Pt
}

// How edges are drawn. Every edge runs orthogonally, leaving and entering
// its boxes square to a side, with rounded corners:
// - two boxes that overlap side to side are joined by one straight line,
//   through the middle of the overlap;
// - otherwise the router tries the routes between each pair of sides
//   (and channels around the boxes in the way) and keeps the shortest
//   with the fewest bends that runs through no box;
// - an end with an author-picked side keeps that side;
// - edges that meet the same side of a box spread out along it, ordered
//   to not cross;
// - a label sits on the longest straight run that keeps it off every box,
//   unless the author placed it (`labelAt`).
const STUB = 20 // the straight run out of a side before the first turn
const RADIUS = 9 // corner rounding
const CLEAR = 8 // room kept around boxes in the way
const INSET = 12 // how close to a corner a straight line may attach
const PORT_GAP = 16 // between edges sharing a side
const TIP_GAP = 1 // between the arrow's tip and the box
const HEAD = 12 // arrowhead length (draw.tsx)
const LABEL_SHOW = 14 // how much line must show on each side of a label
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const horizontal = (s: Side) => s === 'left' || s === 'right'

type Route = { pts: Pt[]; ss: Side; ts: Side }

// One edge's route from box a to box b. `fix` pins sides (author-picked
// or already decided) and, optionally, the exact points on them.
function route(
  a: Box,
  b: Box,
  obstacles: Box[],
  fix: { ss?: Side; ts?: Side; s?: Pt; t?: Pt },
): Route {
  const cands: { pts: Pt[]; ss: Side; ts: Side; cost: number }[] = []
  const add = (pts: Pt[], ss: Side, ts: Side) => {
    const clean = orthogonalPath(pts)
    if (!clean) return
    // Out of the first box and into the second, square to their sides.
    const d0 = dir(clean[0], clean[1])
    const d1 = dir(clean[clean.length - 2], clean[clean.length - 1])
    if (d0[0] !== OUT[ss][0] || d0[1] !== OUT[ss][1] || d1[0] !== -OUT[ts][0] || d1[1] !== -OUT[ts][1]) return
    cands.push({ pts: clean, ss, ts, cost: baseCost(clean) })
  }
  const near = obstacles.filter((o) => overlaps(o, grow(union(a, b), 60)))
  for (const ss of fix.ss ? [fix.ss] : SIDES) {
    for (const ts of fix.ts ? [fix.ts] : SIDES) {
      const s = fix.s ?? sidePoint(a, ss)
      const onB = fix.t ?? sidePoint(b, ts)
      const t = away(onB, ts, TIP_GAP)
      // Straight across, when the boxes face each other and overlap.
      if (!fix.s && !fix.t) {
        const line = straight(a, ss, b, ts)
        if (line) add(line, ss, ts)
      }
      // One end pinned (sharing its side): the other end slides along its
      // side to meet it straight, when it can.
      if (fix.s && !fix.t) {
        const m = alignOn(b, ts, s)
        if (m) add([s, away(m, ts, TIP_GAP)], ss, ts)
      }
      if (fix.t && !fix.s) {
        const m = alignOn(a, ss, fix.t)
        if (m) add([m, t], ss, ts)
      }
      const A = away(s, ss, STUB)
      const B = away(onB, ts, STUB)
      add([s, t], ss, ts)
      add([s, A, B, t], ss, ts)
      add([s, A, [B[0], A[1]], B, t], ss, ts)
      add([s, A, [A[0], B[1]], B, t], ss, ts)
      const xs = [(A[0] + B[0]) / 2, A[0], B[0]]
      const ys = [(A[1] + B[1]) / 2, A[1], B[1]]
      for (const o of [a, b, ...near]) {
        xs.push(o.x - CLEAR - STUB, o.x + o.w + CLEAR + STUB)
        ys.push(o.y - CLEAR - STUB, o.y + o.h + CLEAR + STUB)
      }
      for (const x of xs) add([s, A, [x, A[1]], [x, B[1]], B, t], ss, ts)
      for (const y of ys) add([s, A, [A[0], y], [B[0], y], B, t], ss, ts)
    }
  }
  cands.sort((p, q) => p.cost - q.cost)
  // The cheapest route that runs through nothing; failing that, the one
  // that runs through the least.
  let best = cands[0]
  let bestCost = Infinity
  for (const c of cands) {
    if (c.cost >= bestCost) break
    const hits = blocked(c.pts, a, b, obstacles)
    const cost = c.cost + hits * 2000
    if (cost < bestCost) {
      best = c
      bestCost = cost
    }
    if (hits === 0) break
  }
  return best ?? { pts: [sidePoint(a, 'right'), sidePoint(b, 'left')], ss: 'right', ts: 'left' }
}

// A straight line between two facing sides that overlap, through the
// middle of the overlap (kept clear of the corners).
function straight(a: Box, ss: Side, b: Box, ts: Side): Pt[] | null {
  const facingPair =
    (ss === 'bottom' && ts === 'top' && b.y >= a.y + a.h) ||
    (ss === 'top' && ts === 'bottom' && a.y >= b.y + b.h) ||
    (ss === 'right' && ts === 'left' && b.x >= a.x + a.w) ||
    (ss === 'left' && ts === 'right' && a.x >= b.x + b.w)
  if (!facingPair) return null
  if (horizontal(ss)) {
    const lo = Math.max(a.y, b.y) + INSET
    const hi = Math.min(a.y + a.h, b.y + b.h) - INSET
    if (lo > hi) return null
    const y = clamp((a.y + a.h / 2 + b.y + b.h / 2) / 2, lo, hi)
    return [
      [ss === 'right' ? a.x + a.w : a.x, y],
      away([ts === 'left' ? b.x : b.x + b.w, y], ts, TIP_GAP),
    ]
  }
  const lo = Math.max(a.x, b.x) + INSET
  const hi = Math.min(a.x + a.w, b.x + b.w) - INSET
  if (lo > hi) return null
  const x = clamp((a.x + a.w / 2 + b.x + b.w / 2) / 2, lo, hi)
  return [
    [x, ss === 'bottom' ? a.y + a.h : a.y],
    away([x, ts === 'top' ? b.y : b.y + b.h], ts, TIP_GAP),
  ]
}

// The point on side `side` of `b` in line with `p`, if not too near a corner.
function alignOn(b: Box, side: Side, p: Pt): Pt | null {
  const [x, y] = sidePoint(b, side)
  if (horizontal(side)) return p[1] >= b.y + INSET && p[1] <= b.y + b.h - INSET ? [x, p[1]] : null
  return p[0] >= b.x + INSET && p[0] <= b.x + b.w - INSET ? [p[0], y] : null
}

// The polyline without repeated or collinear points, or null if it isn't
// a usable orthogonal route (a diagonal run, or doubling back on itself).
function orthogonalPath(raw: Pt[]): Pt[] | null {
  const pts: Pt[] = []
  for (const p of raw) {
    const q = pts[pts.length - 1]
    if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) continue
    pts.push(p)
  }
  if (pts.length < 2) return null
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > 0.01 && Math.abs(pts[i][1] - pts[i - 1][1]) > 0.01) return null
  }
  const kept: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const q = kept[kept.length - 1]
    const r = kept[kept.length - 2]
    if (r) {
      const d1 = dir(r, q)
      const d2 = dir(q, p)
      if (d1[0] === -d2[0] && d1[1] === -d2[1]) return null
      if (d1[0] === d2[0] && d1[1] === d2[1]) kept.pop()
    }
    kept.push(p)
  }
  return kept
}

const dir = (p: Pt, q: Pt): Pt => [Math.sign(Math.round(q[0] - p[0])), Math.sign(Math.round(q[1] - p[1]))]

// Shorter is better; each bend costs, and a jog too short to round
// cleanly costs more.
function baseCost(pts: Pt[]): number {
  let cost = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    cost += l
    if (i > 1 && i < pts.length - 1 && l < 2 * RADIUS) cost += 40
  }
  return cost + 30 * (pts.length - 2)
}

// How many boxes the route runs through. The route's own boxes count
// too, except for the first and last runs, which leave and enter them.
function blocked(pts: Pt[], a: Box, b: Box, obstacles: Box[]): number {
  let n = 0
  for (const o of obstacles) if (hitsBox(pts, grow(o, CLEAR - 2), 0, pts.length - 1)) n++
  if (hitsBox(pts, grow(a, -1), 1, pts.length - 1)) n++
  if (hitsBox(pts, grow(b, -1), 0, pts.length - 2)) n++
  return n
}

function hitsBox(pts: Pt[], o: Box, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    if (Math.max(x1, x2) > o.x && Math.min(x1, x2) < o.x + o.w && Math.max(y1, y2) > o.y && Math.min(y1, y2) < o.y + o.h) return true
  }
  return false
}

const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m })
const overlaps = (p: Box, q: Box) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const away = ([x, y]: Pt, s: Side, d: number): Pt => [x + OUT[s][0] * d, y + OUT[s][1] * d]

// The path for a polyline with rounded corners, ending `trim` short.
function rounded(pts: Pt[], trim: number, trimStart = 0): string {
  const first = trimStart
    ? towards(pts[0], pts[1], Math.min(trimStart, Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 2))
    : pts[0]
  let d = `M ${first[0]} ${first[1]}`
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
  const prev = pts[pts.length - 2]
  const end = towards(last, prev, Math.min(trim, Math.hypot(last[0] - prev[0], last[1] - prev[1]) / 2))
  return `${d} L ${end[0]} ${end[1]}`
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

// Where a label of width `w` reads best: the middle of the longest run
// that keeps it off every box, else the route's midpoint. As a fraction
// along the route.
function labelSpot(pts: Pt[], w: number, boxes: Box[]): number {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  const total = lens.reduce((s, l) => s + l, 0) || 1
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((s, l) => s + l, 0))
  // Runs long enough to show the line on both sides of the label come
  // first (longest first), then the rest.
  const fits = (i: number) => lens[i] >= labelSpan(pts[i], pts[i + 1], w) + 2 * LABEL_SHOW
  const tries = lens
    .map((l, i) => ({ l, fit: fits(i), t: (starts[i] + l / 2) / total }))
    .sort((p, q) => Number(q.fit) - Number(p.fit) || q.l - p.l)
    .map((x) => x.t)
  for (const t of [...tries, 0.5, 0.35, 0.65, 0.2, 0.8]) {
    const [x, y] = pointAlong(pts, t)
    const r = { x: x - w / 2, y: y - 10, w, h: 20 }
    if (!boxes.some((b) => overlaps(r, grow(b, 2)))) return t
  }
  return tries[0] ?? 0.5
}

// How much of a run a label covers: its width along a horizontal run, its
// height along a vertical one.
const labelSpan = (p: Pt, q: Pt, w: number) => (Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]) ? w : 20)

// The run of a polyline that holds the point a fraction `t` along it.
function runAt(pts: Pt[], t: number): number {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  let left = Math.max(0, Math.min(1, t)) * lens.reduce((s, l) => s + l, 0)
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) return i
    left -= lens[i]
  }
  return 0
}

function geom(pts: Pt[], labelAt: number, e: SpecEdge, labelW: number): EdgeGeom {
  const p1 = pts[0]
  const p2 = pts[pts.length - 1]
  const q = pts[pts.length - 2]
  let [lx, ly] = pointAlong(pts, labelAt)
  const i = runAt(pts, labelAt)
  const ldir = dir(pts[i], pts[i + 1])
  if (labelW) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    if (len < labelSpan(pts[i], pts[i + 1], labelW) + 2 * LABEL_SHOW) {
      // Too short to show past the label: sit beside the line.
      if (ldir[0] !== 0) ly -= 16
      else lx += labelW / 2 + 7
    }
  }
  const arrows = e.arrows ?? 'end'
  const endHead = arrows === 'end' || arrows === 'both'
  const startHead = arrows === 'start' || arrows === 'both'
  return {
    path: rounded(pts, endHead ? HEAD - 3.5 : 0, startHead ? HEAD - 3.5 : 0),
    pts,
    p1,
    p2,
    angle: Math.atan2(p2[1] - q[1], p2[0] - q[0]),
    angle1: Math.atan2(p1[1] - pts[1][1], p1[0] - pts[1][0]),
    lx,
    ly,
    at: labelAt,
    ldir,
  }
}

// Every edge's geometry, by edge key; edges to missing nodes are skipped.
// `labelWidth` sizes labels, to keep them off boxes. Routing is the costly
// part of drawing a diagram, and the same arrangement is drawn many times
// (the frame, the edges, Dragology's states), so the last few are kept.
const recent: { spec: DiagramSpec; nodes: Placed['nodes']; sides: BakedDiagram['edges']; labelWidth: unknown; out: Map<string, EdgeGeom> }[] = []
export function routeEdges(
  spec: DiagramSpec,
  placed: Placed,
  sides: BakedDiagram['edges'],
  labelWidth: (label: string, arrows?: SpecEdge['arrows']) => number = edgeLabelWidth,
): Map<string, EdgeGeom> {
  const hit = recent.find((r) => r.spec === spec && r.nodes === placed.nodes && r.sides === sides && r.labelWidth === labelWidth)
  if (hit) return hit.out
  const out = routeAll(spec, placed, sides, labelWidth)
  recent.unshift({ spec, nodes: placed.nodes, sides, labelWidth, out })
  recent.length = Math.min(recent.length, 8)
  return out
}

function routeAll(spec: DiagramSpec, placed: Placed, sides: BakedDiagram['edges'], labelWidth: (label: string, arrows?: SpecEdge['arrows']) => number): Map<string, EdgeGeom> {
  const boxes = placed.nodes
  const edges = spec.edges.filter((e) => boxes[e.from] && boxes[e.to] && e.from !== e.to)
  // A tile's label is in the way of every link, its own included, so a
  // link leaves a tile by a side its label is not on.
  const labels = spec.nodes.flatMap((n) => {
    const b = boxes[n.id]
    const l = b && tileLabelBox(n, b)
    return l ? [l] : []
  })
  const others = (e: SpecEdge) => [
    ...Object.entries(boxes)
      .filter(([id]) => id !== e.from && id !== e.to)
      .map(([, o]) => o),
    ...labels,
  ]

  // First pass: each edge on its own, choosing its sides.
  const first = edges.map((e) => {
    const arr = sides?.[edgeKey(e)]
    return route(boxes[e.from], boxes[e.to], others(e), { ss: arr?.source, ts: arr?.target })
  })

  // Edges meeting the same side of a box spread out along it, in the
  // order of where their other ends are, so they don't cross.
  type End = { i: number; end: 's' | 't'; along: number }
  const ends = new Map<string, End[]>()
  edges.forEach((e, i) => {
    const r = first[i]
    const far = (id: string) => boxes[id]
    for (const [end, id, side, other] of [
      ['s', e.from, r.ss, far(e.to)],
      ['t', e.to, r.ts, far(e.from)],
    ] as const) {
      const k = `${id}|${side}`
      const along = horizontal(side) ? other.y + other.h / 2 : other.x + other.w / 2
      ends.set(k, [...(ends.get(k) ?? []), { i, end, along }])
    }
  })
  const ports = new Map<string, Pt>()
  for (const [k, list] of ends) {
    if (list.length < 2) continue
    const [id, side] = k.split('|') as [string, Side]
    const b = boxes[id]
    const len = horizontal(side) ? b.h : b.w
    const gap = Math.min(PORT_GAP, (len - 2 * INSET) / (list.length - 1))
    list.sort((p, q) => p.along - q.along)
    list.forEach((x, j) => {
      const off = (j - (list.length - 1) / 2) * gap
      const [mx, my] = sidePoint(b, side)
      ports.set(`${x.i}|${x.end}`, horizontal(side) ? [mx, my + off] : [mx + off, my])
    })
  }

  const out = new Map<string, EdgeGeom>()
  const nodeBoxes = [...Object.values(boxes), ...labels]
  edges.forEach((e, i) => {
    const ps = ports.get(`${i}|s`)
    const pt = ports.get(`${i}|t`)
    const r = ps || pt ? route(boxes[e.from], boxes[e.to], others(e), { ss: first[i].ss, ts: first[i].ts, s: ps, t: pt }) : first[i]
    const arr = sides?.[edgeKey(e)]
    const lw = e.label ? labelWidth(e.label, e.arrows) : 0
    const at = arr?.labelAt ?? (e.label ? labelSpot(r.pts, lw, nodeBoxes) : 0.5)
    out.set(edgeKey(e), geom(r.pts, at, e, lw))
  })
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
    const m = nodes[n.id] && nodeExtent(n, nodes[n.id])
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
  const boxes: Box[] = [
    ...spec.nodes.flatMap((n) => (placed.nodes[n.id] ? [nodeExtent(n, placed.nodes[n.id])] : [])),
    ...Object.values(placed.nodes),
    ...Object.values(placed.groups),
    ...(baked?.annotations ?? []),
  ]
  const routes = routeEdges(spec, placed, baked?.edges)
  for (const e of spec.edges) {
    const g = routes.get(edgeKey(e))
    if (!g) continue
    boxes.push(pathBounds(g.pts))
    if (e.label) {
      const w = edgeLabelWidth(e.label, e.arrows)
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
  const x0 = Math.min(...xs) - 7
  const y0 = Math.min(...ys) - 7
  return { x: x0, y: y0, w: Math.max(...xs) + 7 - x0, h: Math.max(...ys) + 7 - y0 }
}
