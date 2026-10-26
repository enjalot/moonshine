import { figureData } from '#content'
import type { BakedDiagram, Box } from '../figures/diagram/spec'

// Author-owned figure state, baked at build time from
// content/figures/*.json (a Velite collection: saving a diagram in the
// editor hot-reloads exactly like a prose edit). Code-defined values are
// the fallback for anything not baked, so a figure renders sensibly before
// the author has arranged it and degrades gracefully when the
// machine-owned side gains new elements.

export type BakedFigure = BakedDiagram & { path: string }

// What velite hands back: the current shape, plus pre-0.9 saves.
type RawFigure = Omit<BakedFigure, 'nodes'> & {
  nodes?: Record<string, { x: number; y: number; w?: number; h?: number }>
  layout?: Record<string, { x: number; y: number }>
  viewport?: { x: number; y: number; zoom: number }
}

// Normalized once per velite record, so callers get a stable object
// (DiagramFigure's layout effect depends on its identity).
const normalized = new WeakMap<RawFigure, BakedFigure>()

export function getBakedFigure(figureId: string): BakedFigure | null {
  const raw = (figureData as RawFigure[]).find((d) => d.figure === figureId)
  if (!raw) return null
  let out = normalized.get(raw)
  if (!out) normalized.set(raw, (out = normalize(raw)))
  return out
}

// Pre-0.8 saves stored `layout` (node positions) and a React Flow
// `viewport`. Positions carry over; the viewport is dropped, because its
// zoom is what shrank labels (readers now get the arrangement at natural
// size). Boxes without a size get w/h = 0, which layout.ts's merge treats
// as "measure the label". scripts/upgrade-still.mjs rewrites the file.
function normalize(raw: RawFigure): BakedFigure {
  const { layout, viewport: _viewport, nodes, ...rest } = raw
  const out: Record<string, Box> = {}
  for (const [id, p] of Object.entries(layout ?? {})) out[id] = { x: p.x, y: p.y, w: 0, h: 0 }
  for (const [id, b] of Object.entries(nodes ?? {})) out[id] = { x: b.x, y: b.y, w: b.w ?? 0, h: b.h ?? 0 }
  return { ...rest, nodes: Object.keys(out).length ? out : undefined }
}
