// The shape Velite emits for each article (see velite.config.ts). Kept in
// one place so the components that consume `articles` from `#content`
// don't drift apart in their own copies of the type.
export type ArticleData = {
  title: string
  description?: string
  series?: string
  order?: number
  tags?: string[]
  body: string
  slug: string
  // Content-relative source path, always emitted by Velite's transform.
  // Used by the in-place editor (dev only) to know which file to write
  // back to.
  path: string
}
