import type { FigureEntry } from './registry'
import DrawingFigure from './DrawingFigure'

// Built-in figure kinds for content an author adds in the browser (the "+"
// between blocks). Selected by the directive's `kind` attribute when its id
// isn't in the registry, so author-added figures never need a registry
// edit: `:::figure{id=sketch-2 kind=drawing}`.
const BUILTIN: Record<string, FigureEntry> = {
  drawing: { component: DrawingFigure, height: 240 },
}

export function builtinFigure(kind: unknown): FigureEntry | null {
  return typeof kind === 'string' ? (BUILTIN[kind] ?? null) : null
}
