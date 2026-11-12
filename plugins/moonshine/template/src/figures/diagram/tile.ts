import type { Box, SpecNode } from './spec'
import { FONTS, LINE, textWidth, wrap } from './text'

// A node with an `icon` is drawn as a tile: a rounded square holding the
// glyph, with the label outside it. The node's box in the arrangement is
// the tile; the label is drawn from the node's own position, so it moves
// with the tile and needs no arranging of its own. These helpers say where
// that label is, for drawing, routing (links keep off it), bounds and the
// editor.

export const TILE = 56
const LABEL_MAX = 136
const GAP = 5

export type LabelSide = NonNullable<SpecNode['labelSide']>

export const isTile = (n: SpecNode) => Boolean(n.icon)

export function tileLines(n: SpecNode): string[] {
  return n.label ? wrap(n.label, FONTS.tile, LABEL_MAX) : []
}

// Where a tile's label sits when the node does not say: under the tile in
// a left-to-right diagram, beside it in a top-to-bottom one, so the label
// is never on the side the flow leaves by.
export const labelSideOf = (n: SpecNode, down?: boolean): LabelSide => n.labelSide ?? (down ? 'right' : 'below')

// The label's box, relative to the tile's top-left corner.
export function tileLabelOffset(n: SpecNode, b: { w: number; h: number }, down?: boolean): Box {
  const lines = tileLines(n)
  const w = lines.length ? Math.ceil(Math.max(...lines.map((l) => textWidth(l, FONTS.tile)))) : 0
  const h = lines.length * LINE.tile
  switch (labelSideOf(n, down)) {
    case 'above':
      return { x: b.w / 2 - w / 2, y: -GAP - h, w, h }
    case 'left':
      return { x: -GAP - 3 - w, y: b.h / 2 - h / 2, w, h }
    case 'right':
      return { x: b.w + GAP + 3, y: b.h / 2 - h / 2, w, h }
    default:
      return { x: b.w / 2 - w / 2, y: b.h + GAP, w, h }
  }
}

// The label's box on the page, or null for a box node or an empty label.
export function tileLabelBox(n: SpecNode, b: Box, down?: boolean): Box | null {
  if (!isTile(n) || !n.label) return null
  const o = tileLabelOffset(n, b, down)
  return { x: b.x + o.x, y: b.y + o.y, w: o.w, h: o.h }
}

// Everything a node occupies: its box, plus a tile's label.
export function nodeExtent(n: SpecNode, b: Box, down?: boolean): Box {
  const l = tileLabelBox(n, b, down)
  if (!l) return b
  const x = Math.min(b.x, l.x)
  const y = Math.min(b.y, l.y)
  return { x, y, w: Math.max(b.x + b.w, l.x + l.w) - x, h: Math.max(b.y + b.h, l.y + l.h) - y }
}
