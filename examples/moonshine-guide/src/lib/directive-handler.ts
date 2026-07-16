import { visit } from 'unist-util-visit'
import type { Plugin } from 'unified'
import type { Root } from 'mdast'

// Map remark-directive nodes to HAST-flavored hName/hProperties so that
// react-markdown's `components` prop can render them as our React
// components. The tag names are deliberately dashed (`mn-figure`) so they
// don't collide with real HTML tags — react-markdown is happy to look them
// up in the `components` map by exact string.
//
// Authors write two inline flavors plus the container:
//   container          : :::figure{id=foo}\n caption text \n:::
//   text (labeled)     : :term[label]{to=foo}
//   text (unlabeled)   : :inline-viz{kind=spark value=0.8}
//
// `::name{}` (the leaf form) exists in remark-directive but parses as a
// stand-alone block on its own line — we don't use it because every
// inline case is covered by the text form with or without a [label].
// All directives end up as the same kind of AST node — we just rewrite
// the tag name and pass attributes through.

const directiveHandler: Plugin<[], Root> = () => (tree) => {
  visit(tree, (node: any) => {
    if (
      node.type !== 'textDirective' &&
      node.type !== 'leafDirective' &&
      node.type !== 'containerDirective'
    ) {
      return
    }

    const attrs: Record<string, string> = { ...(node.attributes || {}) }

    // Authors write `to=foo` in markdown; React treats `ref` as reserved
    // and `to` is a hint at intent ("this term points to that figure").
    // We pass attributes straight through — no renames needed because the
    // schema is built around `to`, `id`, `kind`, `caption`.

    const data = node.data || (node.data = {})
    data.hName = `mn-${node.name}`
    data.hProperties = attrs
  })
}

export default directiveHandler
