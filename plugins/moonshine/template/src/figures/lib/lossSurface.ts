// The synthetic two-well loss surface shared by LossLandscape (heatmap +
// descent path) and GradientField (arrow field). One definition so the
// figures can never drift apart — an article's figures must agree about
// the world they depict.
//
// Coordinates are normalized to [-1, 1] on both axes.

// Gaussian wells: a shallower one on the left, a deeper one lower-right.
const WELL_A = { x: -0.6, y: 0, depth: 0.6 }
const WELL_B = { x: 0.5, y: -0.2, depth: 0.8 }

// The deeper well, exported for figures that tag or label its basin
// (GradientField tags arrows inside `radius` with partId 'well').
export const DEEP_WELL = { x: WELL_B.x, y: WELL_B.y, radius: 0.55 }

export function loss(x: number, y: number): number {
  return (
    1 -
    Math.exp(-((x - WELL_A.x) ** 2 + (y - WELL_A.y) ** 2)) * WELL_A.depth -
    Math.exp(-((x - WELL_B.x) ** 2 + (y - WELL_B.y) ** 2)) * WELL_B.depth
  )
}

// Analytic gradient of `loss`. Derived from the expression above; if you
// change the surface, change both together (the exp terms mirror loss).
export function grad(x: number, y: number): [number, number] {
  const ea = Math.exp(-((x - WELL_A.x) ** 2 + (y - WELL_A.y) ** 2)) * WELL_A.depth
  const eb = Math.exp(-((x - WELL_B.x) ** 2 + (y - WELL_B.y) ** 2)) * WELL_B.depth
  return [
    2 * (x - WELL_A.x) * ea + 2 * (x - WELL_B.x) * eb,
    2 * (y - WELL_A.y) * ea + 2 * (y - WELL_B.y) * eb,
  ]
}
