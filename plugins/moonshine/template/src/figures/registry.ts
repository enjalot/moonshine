import type { ComponentType } from 'react'
import GradientField, { DEFAULTS as gradientFieldDefaults } from './GradientField'
import LossLandscape, {
  DEFAULTS as lossLandscapeDefaults,
  PARAM_HINTS as lossLandscapeHints,
} from './LossLandscape'
import FlowDiagram from './FlowDiagram'
import Sparkline, {
  DEFAULTS as sparklineDefaults,
  PARAM_HINTS as sparklineHints,
} from './Sparkline'
import MiniSpark from './inline/MiniSpark'

// The registry is the seam between writers and developers. Authors
// reference figures by id in markdown — never by import. To add a figure:
//   1. Drop a component file in src/figures/
//   2. Register it here under a stable id (ids must not contain ".")
//   3. Use that id in markdown: :::figure{id=your-new-figure}:::
//
// Block figures appear as their own section. Inline figures render
// mid-paragraph. Both kinds receive every directive attribute as a prop:
//   :::figure{id=loss-landscape lr=0.15}  →  props { figureId, lr: "0.15" }
// Attributes arrive as strings; parse them with the helpers in
// lib/params.ts against a DEFAULTS const exported at the top of the
// figure file. That const is the figure's tweakable surface — authors
// override per-instance in markdown, or edit the DEFAULTS in code.

// Props every block figure receives from <Figure>.
export type FigureProps = {
  // The registry id this figure was referenced under. Pass it to
  // useFigureHighlight(figureId) so term→part highlighting can't fall
  // out of sync with the registry key or the markdown id.
  figureId: string
} & Record<string, unknown>

// Explicit slider bounds for a numeric parameter in the knob panel.
// Without a hint, bounds come from the default's magnitude, and an
// integer default infers an integer step.
export type ParamHint = {
  min?: number
  max?: number
  step?: number
}

export type FigureEntry = {
  component: ComponentType<FigureProps>
  // Vertical space (px) reserved before the figure lazily mounts.
  // Prevents layout shift and makes term-pin auto-scroll land correctly
  // for below-fold figures. Estimate generously; exact is not required.
  height?: number
  // Break out of the article column (maps to the .figure-wide class).
  wide?: boolean
  // The figure's exported DEFAULTS. Registering them here powers the
  // dev-only knob panel (Cmd/Ctrl+click the figure): controls are
  // generated from these values' types, and tweaks write back into the
  // directive's attributes in the markdown.
  defaults?: Record<string, number | boolean | string>
  // Optional per-parameter slider bounds (the figure's exported
  // PARAM_HINTS). Use when the magnitude heuristic gets a range wrong —
  // e.g. a coordinate that should run [-1, 1].
  paramHints?: Record<string, ParamHint>
}

export const figures: Record<string, FigureEntry> = {
  'gradient-field': {
    component: GradientField,
    height: 320,
    wide: true,
    defaults: gradientFieldDefaults,
  },
  'loss-landscape': {
    component: LossLandscape,
    height: 350,
    defaults: lossLandscapeDefaults,
    paramHints: lossLandscapeHints,
  },
  'flow-diagram': { component: FlowDiagram, height: 280 },
  sparkline: {
    component: Sparkline,
    height: 120,
    defaults: sparklineDefaults,
    paramHints: sparklineHints,
  },
}

export const inlineFigures: Record<string, ComponentType<Record<string, unknown>>> = {
  'mini-spark': MiniSpark as ComponentType<Record<string, unknown>>,
}
