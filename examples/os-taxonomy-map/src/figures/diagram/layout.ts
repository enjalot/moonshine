import { edgeKey, type Box, type DiagramSpec } from './spec'

// Automatic layout for a DiagramSpec (ELK "layered", the usual choice for
// system and pipeline diagrams), merged with whatever the author has
// already arranged. ELK is loaded on demand: readers only pay for it when
// a diagram has nodes the author has never placed.

// Sized for tldraw's 's' label (about 17px with the article theme) plus
// its label padding, so labels don't wrap once the author opens the editor.
const NODE_FONT = "500 17px 'Source Sans 3', system-ui, sans-serif"
const PAD = { top: 44, side: 24, bottom: 24 }

let ctx: CanvasRenderingContext2D | null = null
export function nodeSize(label: string): { w: number; h: number } {
  ctx ??= document.createElement('canvas').getContext('2d')
  const lines = label.split('\n')
  let w = 8 * Math.max(...lines.map((l) => l.length))
  if (ctx) {
    ctx.font = NODE_FONT
    w = Math.max(...lines.map((l) => ctx!.measureText(l).width))
  }
  return { w: Math.max(104, Math.ceil(w + 48)), h: 52 + 22 * (lines.length - 1) }
}

export type Layout = { nodes: Record<string, Box>; groups: Record<string, Box> }

export async function elkLayout(spec: DiagramSpec): Promise<Layout> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  const groupIds = new Set((spec.groups ?? []).map((g) => g.id))
  const leaf = (n: DiagramSpec['nodes'][number]) => {
    const { w, h } = nodeSize(n.label)
    return { id: n.id, width: w, height: h }
  }
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': spec.direction ?? 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '28',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.edgeLabels.inline': 'true',
      // Follow the spec's node order: the first node is where the flow
      // starts, and a feedback edge (last → first) is the one reversed.
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: [
      ...(spec.groups ?? []).map((g) => ({
        id: `group:${g.id}`,
        layoutOptions: {
          'elk.padding': `[top=${PAD.top},left=${PAD.side},bottom=${PAD.bottom},right=${PAD.side}]`,
        },
        children: spec.nodes.filter((n) => n.group === g.id).map(leaf),
      })),
      ...spec.nodes.filter((n) => !n.group || !groupIds.has(n.group)).map(leaf),
    ],
    edges: spec.edges
      .filter((e) => spec.nodes.some((n) => n.id === e.from) && spec.nodes.some((n) => n.id === e.to))
      .map((e) => ({
        id: edgeKey(e),
        sources: [e.from],
        targets: [e.to],
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
        nodes[k.id] = { x: c.x + k.x, y: c.y + k.y, w: k.width, h: k.height }
      }
    } else {
      nodes[c.id] = { x: c.x, y: c.y, w: c.width, h: c.height }
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
      nodes[n.id] = { ...b, unarranged: false }
      continue
    }
    const e = elk?.nodes[n.id] ?? { x: 0, y: 0, ...nodeSize(n.label) }
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
    const members = spec.nodes.filter((n) => n.group === g.id).map((n) => nodes[n.id])
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
