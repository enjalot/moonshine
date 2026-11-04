// Text measurement for diagrams drawn in SVG, which has no text wrapping
// of its own. Fonts match the .mn-dg-* rules in article.css.

export const FONTS = {
  node: "500 15px 'Source Sans 3', system-ui, sans-serif",
  note: "400 15px 'Source Sans 3', system-ui, sans-serif",
  group: "600 13px 'Source Sans 3', system-ui, sans-serif",
  annot: "400 14px 'Source Sans 3', system-ui, sans-serif",
  edge: "400 12.5px 'Source Sans 3', system-ui, sans-serif",
}
export const LINE = { node: 18.75, annot: 18.9 }

let ctx: CanvasRenderingContext2D | null | undefined
export function textWidth(text: string, font: string): number {
  if (ctx === undefined) ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * 8
  ctx.font = font
  return ctx.measureText(text).width
}

// Lines of `text` no wider than `max`: explicit newlines are kept, and
// long lines break between words (a single long word overflows).
const cache = new Map<string, string[]>()
export function wrap(text: string, font: string, max: number): string[] {
  const key = `${font}|${Math.round(max)}|${text}`
  const hit = cache.get(key)
  if (hit) return hit
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && textWidth(next, font) > max) {
        out.push(line)
        line = word
      } else line = next
    }
    out.push(line)
  }
  if (cache.size > 2000) cache.clear()
  cache.set(key, out)
  return out
}
