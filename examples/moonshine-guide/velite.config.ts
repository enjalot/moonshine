import path from 'node:path'
import { defineConfig, s } from 'velite'

// Velite reads every file in `content/`, validates its frontmatter against
// this schema, and emits typed JSON into `.velite/` for the React app to
// import. The schema is the single source of truth for what authors are
// allowed to put in frontmatter.
//
// The body is exposed raw (via `s.raw()`) because react-markdown does the
// remark/directive parsing at render time — keeping that work on the client
// side means HMR on a content edit is one re-render, not a full rebuild.

const box = s.object({ x: s.number(), y: s.number(), w: s.number(), h: s.number() })
const side = s.enum(['top', 'right', 'bottom', 'left'])
const arrangement = {
  // w/h are optional so pre-0.9 saves (positions only) still load; the
  // missing size is measured from the label (bakedFigures.ts).
  nodes: s
    .record(s.string(), s.object({ x: s.number(), y: s.number(), w: s.number().optional(), h: s.number().optional() }))
    .optional(),
  groups: s.record(s.string(), box).optional(),
  edges: s.record(s.string(), s.object({ source: side.optional(), target: side.optional() })).optional(),
  annotations: s
    .array(
      s.object({
        id: s.string(),
        kind: s.enum(['text', 'note']),
        text: s.string(),
        x: s.number(),
        y: s.number(),
        w: s.number(),
        h: s.number(),
      }),
    )
    .optional(),
  framePad: s.object({ top: s.number(), right: s.number(), bottom: s.number(), left: s.number() }).optional(),
  frame: box.optional(),
}
const specSchema = s.object({
  direction: s.enum(['RIGHT', 'DOWN']).optional(),
  groups: s.array(s.object({ id: s.string(), label: s.string() })).optional(),
  nodes: s.array(
    s.object({
      id: s.string(),
      label: s.string(),
      kind: s.enum(['process', 'data', 'store', 'external', 'decision', 'accent', 'note']).optional(),
      group: s.string().optional(),
      detail: s.string().optional(),
    }),
  ),
  edges: s.array(
    s.object({
      id: s.string().optional(),
      from: s.string(),
      to: s.string(),
      label: s.string().optional(),
      dashed: s.boolean().optional(),
      animated: s.boolean().optional(),
    }),
  ),
})

export default defineConfig({
  root: 'content',
  output: {
    data: '.velite',
    assets: '.velite/assets',
    base: '/assets/',
    clean: true,
  },
  collections: {
    // Author-owned figure state, baked into the build. Diagrams save
    // their arrangement here from the dev arrange editor (node/group boxes,
    // edge sides, annotations, reader frame, optional narrow layout), and
    // the spec too once the author has edited the structure.
    // Read back via src/lib/bakedFigures.ts. Machine-owned semantics (the
    // DiagramSpec) live in the figure's code and are merged with this by
    // id, so regenerated diagram code never clobbers the author's work.
    figureData: {
      name: 'FigureData',
      pattern: 'figures/*.json',
      schema: s
        .object({
          figure: s.string(),
          ...arrangement,
          narrow: s.object(arrangement).optional(),
          spec: specSchema.optional(),
          specFrom: s.string().optional(),
          // Pre-0.8 saves: node positions and a React Flow viewport.
          // Read for compatibility (positions are kept, the viewport is
          // dropped); scripts/upgrade-still.mjs in the moonshine plugin
          // rewrites them in the new shape.
          layout: s.record(s.string(), s.object({ x: s.number(), y: s.number() })).optional(),
          viewport: s.object({ x: s.number(), y: s.number(), zoom: s.number() }).optional(),
        })
        .transform((data, ctx) => {
          const meta = (ctx as unknown as { meta: { path: string } }).meta
          const rel = path
            .relative(path.resolve('content'), meta.path)
            .split(path.sep)
            .join('/')
          return { ...data, path: rel }
        }),
    },
    articles: {
      name: 'Article',
      pattern: '**/*.md',
      schema: s
        .object({
          title: s.string(),
          description: s.string().optional(),
          series: s.string().optional(),
          order: s.number().optional(),
          tags: s.array(s.string()).optional(),
          body: s.raw(),
        })
        .transform((data, ctx) => {
          // Velite injects loader metadata onto the parse context at
          // runtime, but the shape isn't exported from its public types.
          // Cast to access the source file path the article came from.
          const meta = (ctx as unknown as { meta: { path: string } }).meta
          // `path` is the file location relative to the content root, kept
          // so the dev-only save endpoint knows which file a block came
          // from. `slug` flattens that same path into a route segment.
          // Computed with path.relative (not a regex) so a subdirectory
          // that happens to contain "content" in its name can't truncate
          // the result; normalized to forward slashes for URLs and the
          // save endpoint.
          const rel = path
            .relative(path.resolve('content'), meta.path)
            .split(path.sep)
            .join('/')
          return {
            ...data,
            path: rel,
            slug: rel.replace(/\.md$/, '').replace(/[\\/]/g, '-'),
          }
        }),
    },
  },
})
