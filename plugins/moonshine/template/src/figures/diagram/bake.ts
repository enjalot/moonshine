import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { figureData } from '#content'
import { figures } from '../registry'
import { collector, type Seen } from './collect'
import { arranged, elkLayout, narrowSpec, type Layout } from './layout'
import { approxTextWidth } from './metrics'
import { specHash, type BakedDiagram, type DiagramSpec } from './spec'
import { setTextMeasure } from './text'

// Build-time layout. A diagram the author has not fully arranged is laid
// out by ELK, which is over a megabyte: too much to send readers for
// boxes that never move. So `npm run build` lays those diagrams out here,
// in Node, and the article ships the positions instead of the engine
// (vite-plugin-moonshine-layouts.ts runs this and serves the result as
// virtual:moonshine-layouts).
//
// The specs live in figure code, so each registered figure is rendered
// once on the server and DiagramFigure reports its spec (collect.ts).
// Diagrams made in the browser keep their spec in content/figures/*.json
// and are read from there. Text is measured from a table (metrics.ts).
//
// Only what would otherwise need ELK is laid out: the wide arrangement
// when some node has no saved box, and the narrow one when the author has
// not saved one. Author-saved boxes always win (layout.ts merge), and a
// layout is used only for the exact spec it was made from.

export type Prebuilt = { from: string; wide?: Layout; narrow?: Layout }

const round = (l: Layout): Layout => {
  const r = (boxes: Layout['nodes']) =>
    Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }]))
  return { nodes: r(l.nodes), groups: r(l.groups) }
}

export async function bakeLayouts(): Promise<{ layouts: Record<string, Prebuilt>; unchecked: string[] }> {
  setTextMeasure(approxTextWidth)
  const seen = new Map<string, Seen>()
  const unchecked: string[] = []
  collector.current = (s) => seen.set(s.figureId, s)
  try {
    for (const [id, entry] of Object.entries(figures)) {
      try {
        renderToString(createElement(entry.component, { figureId: id }))
      } catch {
        // A figure that needs a browser to render at all. If it holds a
        // diagram, the build cannot see it.
        unchecked.push(id)
      }
    }
  } finally {
    collector.current = null
  }
  // Diagrams added in the browser (`kind=diagram`): no figure file.
  for (const d of figureData as (BakedDiagram & { spec?: DiagramSpec })[]) {
    if (d.spec && !seen.has(d.figure) && !figures[d.figure]) seen.set(d.figure, { figureId: d.figure, spec: d.spec, baked: d })
  }

  const layouts: Record<string, Prebuilt> = {}
  for (const { figureId, spec, baked } of seen.values()) {
    if (!spec.nodes.length) continue
    const out: Prebuilt = { from: specHash(spec) }
    if (!arranged(spec, baked)) out.wide = round(await elkLayout(spec))
    // An automatic narrow layout carries no annotations, so a diagram
    // with annotations and no saved narrow arrangement never asks for one.
    const wantsNarrow = baked?.narrow ? !arranged(spec, baked.narrow) : !baked?.annotations?.length
    if (wantsNarrow) out.narrow = round(await elkLayout(narrowSpec(spec)))
    if (out.wide || out.narrow) layouts[figureId] = out
  }
  setTextMeasure(null)
  return { layouts, unchecked }
}
