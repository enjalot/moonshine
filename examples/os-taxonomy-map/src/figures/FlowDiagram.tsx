import type { FigureProps } from './registry'
import DiagramFigure, { type DiagramNode, type DiagramEdge } from './DiagramFigure'

// React Flow (via DiagramFigure) is the recommended path for node-link
// diagrams. Each node is a real React component, so a
// `:term[step size]{to=flow-diagram.update}` markdown link can light up
// exactly the node whose label contains the step-size parameter (η)
// instead of just outlining the whole diagram.
//
// This file owns the diagram's SEMANTICS: node ids, labels, edges, and
// fallback positions. The author's arrangement (dragged positions, the
// exact viewport) is baked separately in content/figures/flow-diagram.json
// via DiagramFigure's dev-only arrange mode — regenerate this file freely
// and the author's layout survives.
//
// Keep diagrams editorial: ~3–8 nodes, no scroll. If you're approaching
// dozens, you're building a tool, not an article.

const NODES: DiagramNode[] = [
  { id: 'input', label: 'Parameters θ', position: { x: 0, y: 60 } },
  { id: 'loss', label: 'Loss L(θ)', position: { x: 200, y: 0 } },
  { id: 'grad', label: 'Gradient ∇L', position: { x: 200, y: 120 } },
  { id: 'update', label: 'θ ← θ − η∇L', position: { x: 420, y: 60 } },
]

const EDGES: DiagramEdge[] = [
  { id: 'a', source: 'input', target: 'loss', animated: true },
  { id: 'b', source: 'input', target: 'grad', animated: true },
  { id: 'c', source: 'loss', target: 'grad' },
  { id: 'd', source: 'grad', target: 'update', animated: true },
  { id: 'e', source: 'update', target: 'input', type: 'smoothstep' },
]

export default function FlowDiagram({ figureId }: FigureProps) {
  return (
    <DiagramFigure figureId={figureId} nodes={NODES} edges={EDGES} height={280} />
  )
}
