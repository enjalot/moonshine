import { defineConfig, s } from 'velite'

// Velite reads every file in `content/`, validates its frontmatter against
// this schema, and emits typed JSON into `.velite/` for the React app to
// import. The schema is the single source of truth for what authors are
// allowed to put in frontmatter.
//
// The body is exposed raw (via `s.raw()`) because react-markdown does the
// remark/directive parsing at render time — keeping that work on the client
// side means HMR on a content edit is one re-render, not a full rebuild.

export default defineConfig({
  root: 'content',
  output: {
    data: '.velite',
    assets: '.velite/assets',
    base: '/assets/',
    clean: true,
  },
  collections: {
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
          return {
            ...data,
            slug: meta.path
              .replace(/^.*content[\\/]/, '')
              .replace(/\.md$/, '')
              .replace(/[\\/]/g, '-'),
          }
        }),
    },
  },
})
