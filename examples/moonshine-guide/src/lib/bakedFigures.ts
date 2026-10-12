import { figureData } from '#content'
import type { BakedDiagram } from '../figures/diagram/spec'

// Author-owned figure state, baked at build time from
// content/figures/*.json (a Velite collection: saving a diagram in the
// editor hot-reloads exactly like a prose edit). Code-defined values are
// the fallback for anything not baked, so a figure renders sensibly before
// the author has arranged it and degrades gracefully when the
// machine-owned side gains new elements.
//
// Only top-level figures/*.json are collected. The tldraw documents under
// figures/tldraw/ are editor state and never reach the reader bundle.

export type BakedFigure = BakedDiagram & { path: string }

export function getBakedFigure(figureId: string): BakedFigure | null {
  const all = figureData as BakedFigure[]
  return all.find((d) => d.figure === figureId) ?? null
}
