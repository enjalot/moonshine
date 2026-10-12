// The agent-facing diagram spec, and the author-owned bake it pairs with.
//
// An agent (or a person typing) writes a DiagramSpec in a figure file:
// node ids, labels, kinds, groups, edges. That is the machine-owned
// SEMANTICS. Ids are stable handles: they become tldraw shape ids, the
// keys the author's arrangement is merged on, and the part ids that
// `:term[word]{to=figure-id.node-id}` highlights. Rename one only when you
// mean "this is a different thing now".
//
// The author arranges and draws on top in a dev-only tldraw editor. Saving
// writes the author-owned ARRANGEMENT as two files under content/figures/:
//
//   <figure-id>.json              BakedDiagram — what readers get: light and
//                                 dark SVG, part boxes, node boxes, spec hash
//   tldraw/<figure-id>.tldr.json  the full tldraw document, re-opened by the
//                                 editor (never shipped to readers)
//
// Never hand-edit either file; they are the author's surface.

export type NodeKind = 'process' | 'data' | 'store' | 'external' | 'decision' | 'accent' | 'note'

export type SpecNode = {
  id: string
  label: string
  kind?: NodeKind
  group?: string
}

export type SpecEdge = {
  // Defaults to `${from}--${to}`; set one when two edges join the same pair.
  id?: string
  from: string
  to: string
  label?: string
  dashed?: boolean
}

export type SpecGroup = { id: string; label: string }

export type DiagramSpec = {
  // Flow direction for the automatic layout.
  direction?: 'RIGHT' | 'DOWN'
  groups?: SpecGroup[]
  nodes: SpecNode[]
  edges: SpecEdge[]
}

export type Box = { x: number; y: number; w: number; h: number }

export type BakedDiagram = {
  figure: string
  // Hash of the spec the bake was made from. When the agent changes the
  // spec later, the bake is stale: readers get the spec rendering (with
  // the author's saved positions) until the author re-saves.
  specHash?: string
  // Page-space boxes of spec nodes and groups, by spec id.
  nodes?: Record<string, Box>
  groups?: Record<string, Box>
  // Boxes for :term highlights (spec ids plus any shape the author tagged).
  parts?: Record<string, Box>
  // tldraw's export, in page coordinates (viewBox) with fonts stripped so
  // labels use the article's own type.
  svg?: { light: string; dark: string; viewBox: string; width: number; height: number }
}

export const edgeKey = (e: SpecEdge) => e.id ?? `${e.from}--${e.to}`

// Stable short hash of the semantics (order-sensitive on purpose: the agent
// reordering nodes is not a change the author needs to re-save for, but
// it is cheap to treat it as one).
export function specHash(spec: DiagramSpec | undefined): string {
  if (!spec) return 'none'
  const s = JSON.stringify(spec)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}
