import { create } from 'zustand'

// Two-state interaction model for terms and figures:
//
//   hoveredTermRef — transient, set on pointerenter/focus, cleared on leave.
//                    Drives a SOFT highlight (subtle outline).
//   pinnedTermRef  — sticky, set on click, drives a STRONG highlight that
//                    persists until something else is clicked or the same
//                    term is clicked again to toggle off.
//
// Term refs follow the convention `figure-id` or `figure-id.part-id`. The
// dotted form lets a term highlight a specific element WITHIN a figure
// (e.g. one node of a React Flow diagram), not just outline the whole
// figure. Use `parseRef` / `useFigureHighlight` to consume.
//
// Both `<Term>` and `<Figure>` subscribe. Clicking a term scrolls the
// matching figure into view; hovering just highlights without scrolling.

type ArticleStore = {
  hoveredTermRef: string | null
  pinnedTermRef: string | null
  setHovered: (ref: string | null) => void
  togglePinned: (ref: string | null) => void
  clearPinned: () => void
}

export const useArticleStore = create<ArticleStore>((set, get) => ({
  hoveredTermRef: null,
  pinnedTermRef: null,
  setHovered: (ref) => set({ hoveredTermRef: ref }),
  togglePinned: (ref) =>
    set({ pinnedTermRef: get().pinnedTermRef === ref ? null : ref }),
  clearPinned: () => set({ pinnedTermRef: null }),
}))

// Parse a term reference of the form "figure-id" or "figure-id.part-id".
// Returns:
//   undefined → ref is null OR ref targets a different figure (no highlight)
//   null      → ref targets THIS figure as a whole (no part-id)
//   string    → ref targets a specific part-id within this figure
export function parseRef(
  ref: string | null,
  figureId: string,
): string | null | undefined {
  if (!ref) return undefined
  const dot = ref.indexOf('.')
  const fig = dot === -1 ? ref : ref.slice(0, dot)
  if (fig !== figureId) return undefined
  return dot === -1 ? null : ref.slice(dot + 1)
}

// Convenience hook for figures: returns hover and pinned state for the
// figure as a whole plus the part-id (if any) the active ref targets.
// Subscribe at the figure level; subscribe at the element level for
// finer-grained part highlighting (see GradientField, FlowDiagram).
export const useFigureHighlight = (figureId: string | undefined) => {
  const hoveredRef = useArticleStore((s) => s.hoveredTermRef)
  const pinnedRef = useArticleStore((s) => s.pinnedTermRef)
  if (!figureId) {
    return {
      hovered: false,
      pinned: false,
      hoveredPart: undefined as string | null | undefined,
      pinnedPart: undefined as string | null | undefined,
      activePart: undefined as string | null | undefined,
    }
  }
  const hoveredPart = parseRef(hoveredRef, figureId)
  const pinnedPart = parseRef(pinnedRef, figureId)
  return {
    hovered: hoveredPart !== undefined,
    pinned: pinnedPart !== undefined,
    hoveredPart,
    pinnedPart,
    // Pinned wins, including the case where pinnedPart === null (a
    // whole-figure pin) — `??` would incorrectly fall through to
    // hoveredPart on null. Use an undefined check instead.
    activePart: pinnedPart !== undefined ? pinnedPart : hoveredPart,
  }
}
