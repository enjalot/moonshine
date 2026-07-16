import type { FigureProps } from './registry'
import DiagramFigure, { type DiagramNode, type DiagramEdge } from './DiagramFigure'

// A REAL DiagramFigure (React Flow), not a simulation: the still pipeline
// that turns this article's markdown into the page you are reading. This
// file owns the machine-owned semantics (node ids, labels, edges, fallback
// positions); the author-owned arrangement lives in
// content/figures/still-pipeline.json, saved from the dev-only arrange
// mode. Regenerate this file freely and the author's layout survives.
//
// The dotted :term form can target single nodes, e.g.
// `:term[the registry]{to=still-pipeline.registry}`.

const NODES: DiagramNode[] = [
  { id: 'markdown', label: 'markdown source', position: { x: 0, y: 90 } },
  { id: 'directive', label: 'remark-directive', position: { x: 190, y: 20 } },
  { id: 'registry', label: 'figure registry', position: { x: 380, y: 90 } },
  { id: 'component', label: 'React figure', position: { x: 560, y: 20 } },
  { id: 'page', label: 'rendered page', position: { x: 740, y: 90 } },
]

const EDGES: DiagramEdge[] = [
  { id: 'a', source: 'markdown', target: 'directive', animated: true },
  { id: 'b', source: 'directive', target: 'registry', animated: true },
  { id: 'c', source: 'registry', target: 'component', animated: true },
  { id: 'd', source: 'component', target: 'page', animated: true },
  // Edits made on the page (knob saves, prose splices) write back into
  // the markdown, closing the authoring loop.
  { id: 'e', source: 'page', target: 'markdown', type: 'smoothstep' },
]

export default function StillPipelineDiagram({ figureId }: FigureProps) {
  return (
    <DiagramFigure figureId={figureId} nodes={NODES} edges={EDGES} height={260} />
  )
}
