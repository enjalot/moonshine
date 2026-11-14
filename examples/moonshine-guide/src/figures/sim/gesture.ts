// Shared gesture for the feature SIMULATIONS in this article's figures.
//
// Sims respond to a plain click or drag: primary button, no modifier.
// Cmd/Ctrl+click belongs to the real moonshine editor (prose editing,
// knob panels, reordering), so a modified click must never read as a sim
// activation — it falls through to the edit layer instead.
//
// One definition so every sim agrees and the boundary between "operate
// the demo" (plain click) and "edit the article" (Cmd/Ctrl+click) stays
// consistent across figures.
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'

// True when an event is a plain primary-button interaction: no Cmd/Ctrl
// (those open the real editor) and not a secondary/middle click.
export function isSimActivate(
  e: ReactPointerEvent | ReactMouseEvent | PointerEvent | MouseEvent,
): boolean {
  if (e.metaKey || e.ctrlKey) return false
  return !('button' in e) || e.button === 0
}
