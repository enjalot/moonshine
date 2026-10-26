import type { FigureProps } from './registry'
import DiagramFigure, { type DiagramSpec } from './DiagramFigure'

// Diagrams declare a spec: stable ids, labels, kinds, edges. That is the
// machine-owned half, safe to regenerate. Layout comes from ELK until the
// author opens "edit diagram" (dev only), drags things where they belong,
// adds notes, and saves; readers then get a live React Flow diagram with
// that arrangement. (If the author edits the structure there too, the
// spec saved in content/figures/flow-diagram.json wins over this one.) Node ids double as term targets: in the example,
// `:term[step size]{to=flow-diagram.update}` lights up the update node.
//
// Keep diagrams editorial: ~3–12 nodes. Past that you're building a tool,
// not an article.

const SPEC: DiagramSpec = {
  direction: 'RIGHT',
  nodes: [
    { id: 'input', label: 'Parameters θ' },
    { id: 'loss', label: 'Loss L(θ)' },
    { id: 'grad', label: 'Gradient ∇L' },
    { id: 'update', label: 'θ ← θ − η∇L', kind: 'accent' },
  ],
  edges: [
    { from: 'input', to: 'loss' },
    { from: 'loss', to: 'grad' },
    { from: 'grad', to: 'update' },
    { from: 'update', to: 'input', label: 'repeat', dashed: true },
  ],
}

export default function FlowDiagram({ figureId }: FigureProps) {
  return <DiagramFigure figureId={figureId} spec={SPEC} />
}
