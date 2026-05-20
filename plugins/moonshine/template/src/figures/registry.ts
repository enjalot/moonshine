import type { ComponentType } from 'react'
import GradientField from './GradientField'
import LossLandscape from './LossLandscape'
import FlowDiagram from './FlowDiagram'
import Sparkline from './Sparkline'
import MiniSpark from './inline/MiniSpark'

// The registry is the seam between writers and developers. Authors
// reference figures by id in markdown — never by import. To add a figure:
//   1. Drop a component file in src/figures/
//   2. Register it here under a stable id
//   3. Use that id in markdown: :::figure{id=your-new-figure}:::
//
// Block figures appear as their own section. Inline figures render
// mid-paragraph and accept arbitrary props from the directive.
export const figures: Record<string, ComponentType> = {
  'gradient-field': GradientField,
  'loss-landscape': LossLandscape,
  'flow-diagram': FlowDiagram,
  sparkline: Sparkline,
}

export const inlineFigures: Record<string, ComponentType<Record<string, unknown>>> = {
  'mini-spark': MiniSpark as ComponentType<Record<string, unknown>>,
}
