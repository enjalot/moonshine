import type { BakedDiagram, DiagramSpec } from './spec'

// During `npm run build` the diagrams are rendered once on the server so
// the build can lay them out (see bake.ts). DiagramFigure reports what it
// is about to draw here. Unused in the browser.
export type Seen = { figureId: string; spec: DiagramSpec; baked: BakedDiagram | null }
export const collector: { current: ((seen: Seen) => void) | null } = { current: null }
