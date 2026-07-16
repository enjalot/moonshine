import type { ComponentType } from 'react'
// This article's figures are simulations of the moonshine editing
// features, plus one REAL DiagramFigure (still-pipeline) so the baked
// layout machinery the prose describes is also demonstrated for real.
import ProseEditSim from './sim/ProseEditSim'
import KnobsSim, { DEFAULTS as knobsDefaults, PARAM_HINTS as knobsHints } from './sim/KnobsSim'
import ReorderSim from './sim/ReorderSim'
import TermsSim from './sim/TermsSim'
import BakedDiagramSim from './sim/BakedDiagramSim'
import DualSurfaceSim from './sim/DualSurfaceSim'
import FeedbackSim from './sim/FeedbackSim'
import StillPipelineDiagram from './StillPipelineDiagram'

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
  'prose-edit': { component: ProseEditSim, height: 320 },
  // Registering DEFAULTS/PARAM_HINTS makes the REAL knob panel work on
  // this figure during dev (Cmd/Ctrl+click it): the panel the sim
  // depicts opens on the sim itself, with the same slider bounds.
  knobs: {
    component: KnobsSim,
    height: 360,
    defaults: knobsDefaults,
    paramHints: knobsHints,
  },
  reorder: { component: ReorderSim, height: 300 },
  terms: { component: TermsSim, height: 300 },
  'still-pipeline': { component: StillPipelineDiagram, height: 320, wide: true },
  'baked-diagram': { component: BakedDiagramSim, height: 380, wide: true },
  'dual-surface': { component: DualSurfaceSim, height: 440, wide: true },
  feedback: { component: FeedbackSim, height: 420, wide: true },
}

export const inlineFigures: Record<string, ComponentType<Record<string, unknown>>> = {}
