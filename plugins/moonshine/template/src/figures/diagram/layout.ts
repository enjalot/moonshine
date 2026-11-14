import { GROUP_PAD } from './geometry'
import { edgeKey, type Box, type DiagramSpec } from './spec'
import { FONTS, textWidth } from './text'
import { isTile, nodeExtent, TILE } from './tile'

// Automatic layout for a DiagramSpec (ELK "layered", the usual choice for
// system and pipeline diagrams), merged with whatever the author has
// already arranged. ELK is loaded on demand: readers only pay for it when
// a diagram has nodes the author has never placed.

// Sized to the node label (.mn-dg-label: 15px heading font, 500) plus
// its padding, with slack so labels don't wrap.
const PAD = GROUP_PAD
export function nodeSize(label: string): { w: number; h: number } {
  const lines = label.split('\n')
  const w = Math.max(...lines.map((l) => textWidth(l, FONTS.node)))
  return { w: Math.max(104, Math.ceil(w + 48)), h: 52 + 22 * (lines.length - 1) }
}

export type Layout = { nodes: Record<string, Box>; groups: Record<string, Box> }

export async function elkLayout(spec: DiagramSpec): Promise<Layout> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  const groupIds = new Set((spec.groups ?? []).map((g) => g.id))
  // A tile is laid out as the room it and its label take up, then drawn
  // as the tile inside that room.
  const tileRoom = (n: DiagramSpec['nodes'][number]) => nodeExtent(n, { x: 0, y: 0, w: TILE, h: TILE }, spec.direction === 'DOWN')
  // A tile's links leave and arrive at the tile, not at the middle of the
  // room it shares with its label, so ELK is given ports at the tile's
  // centre line: tiles along a flow then line up and their links run
  // straight.
  const down = spec.direction === 'DOWN'
  const portId = (id: string, end: 'in' | 'out') => `port:${id}:${end}`
  const leaf = (n: DiagramSpec['nodes'][number]) => {
    if (isTile(n)) {
      const r = tileRoom(n)
      const width = r.w + 16
      const height = r.h + 8
      const cx = 8 - r.x + TILE / 2
      const cy = 4 - r.y + TILE / 2
      const port = (end: 'in' | 'out') => ({
        id: portId(n.id, end),
        width: 0,
        height: 0,
        x: down ? cx : end === 'in' ? 0 : width,
        y: down ? (end === 'in' ? 0 : height) : cy,
        layoutOptions: { 'elk.port.side': down ? (end === 'in' ? 'NORTH' : 'SOUTH') : end === 'in' ? 'WEST' : 'EAST' },
      })
      return { id: n.id, width, height, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' }, ports: [port('in'), port('out')] }
    }
    const { w, h } = nodeSize(n.label)
    return { id: n.id, width: w, height: h }
  }
  const tiles = new Set(spec.nodes.filter(isTile).map((n) => n.id))
  const byId = new Map(spec.nodes.map((n) => [n.id, n]))
  const boxIn = (id: string, x: number, y: number, w: number, h: number): Box => {
    const n = byId.get(id)
    if (!n || !isTile(n)) return { x, y, w, h }
    const r = tileRoom(n)
    return { x: x + 8 - r.x, y: y + 4 - r.y, w: TILE, h: TILE }
  }
  // Nothing connected (a vocabulary: the pieces, before any figure links
  // them): a grid in reading order, which a layered layout would stack in
  // one column.
  if (!spec.edges.length && !(spec.groups ?? []).length) {
    const nodes: Record<string, Box> = {}
    const sizes = spec.nodes.map((n) => leaf(n))
    const cellW = Math.max(...sizes.map((s) => s.width), 0) + 28
    const cellH = Math.max(...sizes.map((s) => s.height), 0) + 24
    const perRow = (spec.direction ?? 'RIGHT') === 'RIGHT' ? Math.min(6, Math.max(1, spec.nodes.length <= 6 ? spec.nodes.length : Math.ceil(spec.nodes.length / 2))) : 1
    spec.nodes.forEach((n, i) => {
      const s = sizes[i]
      const x = (i % perRow) * cellW + (cellW - s.width) / 2
      const y = Math.floor(i / perRow) * cellH
      nodes[n.id] = boxIn(n.id, x, y, s.width, s.height)
    })
    return { nodes, groups: {} }
  }
  // Top-level children in the order the spec first mentions them, a group
  // standing where its first member does, so the flow starts where the
  // spec does.
  const children: unknown[] = []
  const seen = new Set<string>()
  for (const n of spec.nodes) {
    if (n.group && groupIds.has(n.group)) {
      if (seen.has(n.group)) continue
      seen.add(n.group)
      children.push({
        id: `group:${n.group}`,
        layoutOptions: {
          'elk.padding': `[top=${PAD.top},left=${PAD.side},bottom=${PAD.bottom},right=${PAD.side}]`,
        },
        children: spec.nodes.filter((m) => m.group === n.group).map(leaf),
      })
    } else children.push(leaf(n))
  }
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': spec.direction ?? 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '28',
      // Tiles are small and their links carry the labels, so they sit
      // closer than boxes do.
      'elk.layered.spacing.nodeNodeBetweenLayers': tiles.size ? '32' : '56',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.edgeLabels.inline': 'true',
      // Follow the spec's node order: the first node is where the flow
      // starts, and a feedback edge (last → first) is the one reversed.
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children,
    edges: spec.edges
      .filter((e) => spec.nodes.some((n) => n.id === e.from) && spec.nodes.some((n) => n.id === e.to))
      .map((e) => ({
        id: edgeKey(e),
        sources: [tiles.has(e.from) ? portId(e.from, 'out') : e.from],
        targets: [tiles.has(e.to) ? portId(e.to, 'in') : e.to],
        labels: e.label ? [{ text: e.label, width: e.label.length * 7 + 12, height: 18 }] : [],
      })),
  }
  // elkjs types are loose; the result mirrors the input tree with x/y/width/height.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = await elk.layout(graph as any)
  const nodes: Record<string, Box> = {}
  const groups: Record<string, Box> = {}
  for (const c of out.children ?? []) {
    if (String(c.id).startsWith('group:')) {
      groups[c.id.slice(6)] = { x: c.x, y: c.y, w: c.width, h: c.height }
      for (const k of c.children ?? []) {
        nodes[k.id] = boxIn(k.id, c.x + k.x, c.y + k.y, k.width, k.height)
      }
    } else {
      nodes[c.id] = boxIn(c.id, c.x, c.y, c.width, c.height)
    }
  }
  return { nodes, groups }
}

export type Placement = {
  nodes: Record<string, Box & { unarranged: boolean }>
  groups: Record<string, Box>
}

// Merge rules (author wins by id):
// - a node with a saved box keeps it;
// - a node added after the author arranged gets its ELK position, shifted
//   by how far its arranged neighbours were moved, then nudged until it
//   clears every arranged node, and is flagged `unarranged`;
// - a group keeps its saved box but grows to contain its members.
export function merge(
  spec: DiagramSpec,
  elk: Layout | null,
  saved?: { nodes?: Record<string, Box>; groups?: Record<string, Box> } | null,
): Placement {
  const nodes: Placement['nodes'] = {}
  const delta = (id: string) => {
    const b = saved?.nodes?.[id]
    const e = elk?.nodes[id]
    return b && e ? { dx: b.x - e.x, dy: b.y - e.y } : null
  }
  const all = spec.nodes.map((n) => delta(n.id)).filter(Boolean) as { dx: number; dy: number }[]
  const anySaved = Boolean(saved?.nodes && Object.keys(saved.nodes).length)
  for (const n of spec.nodes) {
    const b = saved?.nodes?.[n.id]
    if (b) {
      // A saved position without a size (pre-0.9 saves) gets the label's.
      nodes[n.id] = { ...(b.w && b.h ? b : { ...b, ...(isTile(n) ? { w: TILE, h: TILE } : nodeSize(n.label)) }), unarranged: false }
      continue
    }
    const e = elk?.nodes[n.id] ?? { x: 0, y: 0, ...(isTile(n) ? { w: TILE, h: TILE } : nodeSize(n.label)) }
    const nbrs = spec.edges
      .flatMap((x) => (x.from === n.id ? [x.to] : x.to === n.id ? [x.from] : []))
      .map(delta)
      .filter(Boolean) as { dx: number; dy: number }[]
    const pool = nbrs.length ? nbrs : all
    const dx = pool.length ? pool.reduce((s, d) => s + d.dx, 0) / pool.length : 0
    const dy = pool.length ? pool.reduce((s, d) => s + d.dy, 0) / pool.length : 0
    nodes[n.id] = { ...e, x: e.x + dx, y: e.y + dy, unarranged: anySaved }
  }

  const hit = (a: Box, b: Box, m = 24) =>
    a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m
  const placed = Object.values(nodes).filter((v) => !v.unarranged)
  for (const v of Object.values(nodes).filter((v) => v.unarranged)) {
    for (let i = 0; i < 50 && placed.some((p) => hit(v, p)); i++) {
      if ((spec.direction ?? 'RIGHT') === 'RIGHT') v.y += v.h + 20
      else v.x += v.w + 20
    }
    placed.push(v)
  }

  const groups: Record<string, Box> = {}
  for (const g of spec.groups ?? []) {
    const members = spec.nodes.filter((n) => n.group === g.id).map((n) => nodeExtent(n, nodes[n.id], spec.direction === 'DOWN'))
    let box: Box | undefined = saved?.groups?.[g.id]
    for (const m of members) {
      const x0 = Math.min(box?.x ?? Infinity, m.x - PAD.side)
      const y0 = Math.min(box?.y ?? Infinity, m.y - PAD.top)
      const x1 = Math.max(box ? box.x + box.w : -Infinity, m.x + m.w + PAD.side)
      const y1 = Math.max(box ? box.y + box.h : -Infinity, m.y + m.h + PAD.bottom)
      box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    }
    if (box) groups[g.id] = box
  }
  return { nodes, groups }
}

// Lay out only when needed: if every node already has a saved box, ELK is
// never loaded.
export async function place(
  spec: DiagramSpec,
  saved?: { nodes?: Record<string, Box>; groups?: Record<string, Box> } | null,
): Promise<Placement> {
  const complete = spec.nodes.every((n) => saved?.nodes?.[n.id])
  return merge(spec, complete ? null : await elkLayout(spec), saved)
}

// The spec turned a quarter: a RIGHT flow laid out top to bottom. Used
// for narrow screens when a diagram is too wide to read at full size.
export function narrowSpec(spec: DiagramSpec): DiagramSpec {
  return { ...spec, direction: (spec.direction ?? 'RIGHT') === 'RIGHT' ? 'DOWN' : 'RIGHT' }
}
