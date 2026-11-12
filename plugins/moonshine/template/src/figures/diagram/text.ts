import { useSyncExternalStore } from 'react'

// Text measurement for diagrams drawn in SVG, which has no text wrapping
// of its own. Fonts match the .mn-dg-* rules in article.css.

export const FONTS = {
  node: "500 15px 'Source Sans 3', system-ui, sans-serif",
  note: "400 15px 'Source Sans 3', system-ui, sans-serif",
  group: "600 13px 'Source Sans 3', system-ui, sans-serif",
  annot: "400 14px 'Source Sans 3', system-ui, sans-serif",
  edge: "400 13px 'Source Sans 3', system-ui, sans-serif",
  tile: "500 14px 'Source Sans 3', system-ui, sans-serif",
}
export const LINE = { node: 18.75, annot: 18.9, tile: 17.5 }

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

// An edge label's width, with its padding (.mn-dg-edge-label) and room for
// its direction marks: one for a one-way link, two for a two-way one.
export const CHEVRON = 11
export function edgeLabelWidth(label: string, arrows: 'end' | 'start' | 'both' | 'none' = 'end'): number {
  const marks = arrows === 'both' ? 2 : arrows === 'none' ? 0 : 1
  return textWidth(label, FONTS.edge) + 14 + marks * CHEVRON
}

// Web fonts can arrive after a diagram first measured its text. When any
// finish loading, measurements are dropped and diagrams that read
// useFontEpoch() in their drawing redraw.
let epoch = 0
const listeners = new Set<() => void>()
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener('loadingdone', () => {
    cache.clear()
    epoch++
    listeners.forEach((l) => l())
  })
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function useFontEpoch(): number {
  return useSyncExternalStore(subscribe, () => epoch, () => 0)
}
