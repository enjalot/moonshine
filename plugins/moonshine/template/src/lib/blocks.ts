import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkMath from 'remark-math'
import type { Root } from 'mdast'

// Top-level block geometry for the in-place editor's reordering. The body
// is a sequence of top-level Markdown blocks (paragraphs, headings, lists,
// fenced code, `:::figure` container directives, `$$` math, …). To move one
// up or down we need their source ranges in document order — exactly the
// root children of the mdast tree.
//
// We parse with the same plugin set Article.tsx renders with, so the
// offsets here match the `position` offsets react-markdown reports on each
// block's hast node (remark-rehype carries position through). That lets the
// editor correlate a rendered block with its entry in this list. All of
// this is dev-only (callers gate on EDIT_ENABLED); remark-parse is already
// in the bundle via react-markdown, so it adds no production weight.

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkMath)

export type Block = { start: number; end: number }

export function topLevelBlocks(body: string): Block[] {
  let tree: Root
  try {
    tree = processor.parse(body) as Root
  } catch {
    return []
  }
  const out: Block[] = []
  for (const node of tree.children) {
    const start = node.position?.start?.offset
    const end = node.position?.end?.offset
    if (typeof start === 'number' && typeof end === 'number') {
      out.push({ start, end })
    }
  }
  return out
}

// Index of the top-level block that contains an offset (e.g. a nested
// caption paragraph or list item maps to its enclosing figure or list).
export function blockIndexAt(blocks: Block[], offset: number): number {
  return blocks.findIndex((b) => b.start <= offset && offset < b.end)
}

// Rebuild the body with the top-level blocks in a new order. `order` is a
// permutation of block indices. Separators normalize to one blank line —
// the body's existing convention — so a pure swap produces a minimal diff
// (only the moved blocks change). Content before the first block / after
// the last (none, for a velite-trimmed body) is preserved.
export function rebuildBody(body: string, blocks: Block[], order: number[]): string {
  if (blocks.length === 0) return body
  const texts = blocks.map((b) => body.slice(b.start, b.end))
  const prefix = body.slice(0, blocks[0].start)
  const suffix = body.slice(blocks[blocks.length - 1].end)
  return prefix + order.map((i) => texts[i]).join('\n\n') + suffix
}

// order array that moves block `from` to sit at array index `to`.
export function moveOrder(count: number, from: number, to: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i)
  const [m] = order.splice(from, 1)
  order.splice(to, 0, m)
  return order
}
