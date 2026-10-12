import type { FigureProps } from './registry'
import DiagramFigure, { type DiagramSpec } from './DiagramFigure'

// A REAL DiagramFigure, not a simulation: the still pipeline that turns
// this article's markdown into the page you are reading. This file owns
// the semantics (ids, labels, edges); the author-owned arrangement lives
// in content/figures/still-pipeline.json, saved from the dev-only tldraw
// editor. Regenerate this file freely and the author's layout survives.
//
// Node ids are term targets, e.g.
// `:term[the registry]{to=still-pipeline.registry}`.

const SPEC: DiagramSpec = {
  direction: 'RIGHT',
  nodes: [
    { id: 'markdown', label: 'markdown source', kind: 'data' },
    { id: 'directive', label: 'remark-directive' },
    { id: 'registry', label: 'figure registry', kind: 'accent' },
    { id: 'component', label: 'React figure' },
    { id: 'page', label: 'rendered page' },
  ],
  edges: [
    { from: 'markdown', to: 'directive' },
    { from: 'directive', to: 'registry' },
    { from: 'registry', to: 'component' },
    { from: 'component', to: 'page' },
    // Edits made on the page (knob saves, prose splices) write back into
    // the markdown, closing the authoring loop.
    { from: 'page', to: 'markdown', label: 'edits save back', dashed: true },
  ],
}

export default function StillPipelineDiagram({ figureId }: FigureProps) {
  return <DiagramFigure figureId={figureId} spec={SPEC} />
}
