// The agent-facing diagram spec, and the author-owned bake it pairs with.
//
// An agent (or a person typing) writes a DiagramSpec in a figure file:
// node ids, labels, kinds, groups, edges. That is the machine-owned
// SEMANTICS. Ids are stable handles: they become React Flow node ids, the
// keys the author's arrangement is merged on, and the part ids that
// `:term[word]{to=figure-id.node-id}` highlights. Rename one only when you
// mean "this is a different thing now".
//
// The author arranges it in the dev-only diagram editor (React Flow):
// positions, sizes, which side an edge attaches to, text/note annotations,
// and the crop frame readers see. Saving writes that ARRANGEMENT to
// content/figures/<figure-id>.json; readers get a live React Flow diagram
// built from spec + arrangement. Never hand-edit the arrangement; it is
// the author's surface, like their prose.
//
// The author can change the structure too (add, rename, connect, delete
// boxes) in the same editor. That saves the whole spec into the JSON
// (`spec`), and from then on the JSON copy is the one drawn: the spec in
// code is ignored. `specFrom` records which code spec it started from, so
// the dev bar can say when the code has changed since. A diagram added in
// the browser ("+" → Diagram, built-in `kind=diagram`) has no figure file
// and keeps its spec in the JSON from the start. Either way, an agent
// answering a comment edits that `spec`.

export type NodeKind = 'process' | 'data' | 'store' | 'external' | 'decision' | 'accent' | 'note'

export type SpecNode = {
  id: string
  label: string
  kind?: NodeKind
  group?: string
  // Optional reader-facing detail, shown when a reader hovers or focuses
  // the node.
  detail?: string
}

export type SpecEdge = {
  // Defaults to `${from}--${to}`; set one when two edges join the same pair.
  id?: string
  from: string
  to: string
  label?: string
  dashed?: boolean
  // Marching-ants animation, for edges that carry a flow the prose is about.
  animated?: boolean
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

export type Side = 'top' | 'right' | 'bottom' | 'left'

// Author-added text on a diagram. `note` is a tinted sticky; `text` is a
// bare label. Ids are stable term targets too.
export type Annotation = {
  id: string
  kind: 'text' | 'note'
  text: string
  x: number
  y: number
  w: number
  h: number
}

export type BakedDiagram = {
  figure: string
  // Page-space boxes of spec nodes and groups, by spec id. Nodes missing
  // here (added to the spec later) are placed automatically.
  nodes?: Record<string, Box>
  groups?: Record<string, Box>
  // Per-edge attachment sides; omitted = border-to-border straight line.
  edges?: Record<string, { source?: Side; target?: Side }>
  annotations?: Annotation[]
  // What readers see, in page space. Defaults to the bounds of everything.
  frame?: Box
  // Optional second arrangement for narrow screens (see DiagramFigure),
  // saved from the editor's "narrow" tab. Without one, narrow screens get
  // an automatic top-to-bottom layout of the spec.
  narrow?: Arrangement
  // The spec, once the author has edited the structure (see above).
  spec?: DiagramSpec
  specFrom?: string
}

// The arrangement half of a BakedDiagram, on its own.
export type Arrangement = Pick<BakedDiagram, 'nodes' | 'groups' | 'edges' | 'annotations' | 'frame'>

export const edgeKey = (e: SpecEdge) => e.id ?? `${e.from}--${e.to}`

// A short fingerprint of a spec, for `specFrom`.
export function specHash(spec: DiagramSpec): string {
  const str = JSON.stringify(spec)
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
