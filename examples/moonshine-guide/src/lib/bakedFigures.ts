import { figureData } from '#content'

// Author-owned figure state, baked at build time from
// content/figures/*.json (a Velite collection — dragging a node in
// arrange mode hot-reloads exactly like a prose edit). Code-defined
// values are the fallback for anything not baked, so a figure renders
// sensibly before the author has arranged it and degrades gracefully
// when the machine-owned side gains new elements.

export type BakedFigure = {
  figure: string
  layout?: Record<string, { x: number; y: number }>
  viewport?: { x: number; y: number; zoom: number }
  path: string
}

export function getBakedFigure(figureId: string): BakedFigure | null {
  const all = figureData as BakedFigure[]
  return all.find((d) => d.figure === figureId) ?? null
}
