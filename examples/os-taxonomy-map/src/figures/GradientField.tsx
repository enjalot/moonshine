import { useId, useMemo } from 'react'
import { useFigureHighlight } from '../store'
import type { FigureProps } from './registry'
import { grad, DEEP_WELL } from './lib/lossSurface'
import { num } from './lib/params'

// Vector field of arrows pointing in the negative-gradient direction
// (downhill) of the shared two-well loss surface (lib/lossSurface.ts —
// same surface LossLandscape draws). Arrows inside the basin of the
// deeper well are tagged `partId: 'well'`, so a
// `:term[gradient]{to=gradient-field.well}` markdown link can light
// up just that cluster instead of outlining the whole figure.

// Tweakable surface. Override per-instance from markdown:
//   :::figure{id=gradient-field cols=20 rows=14}
export const DEFAULTS = {
  cols: 14, // grid density
  rows: 10,
  len: 18, // arrow length in viewBox px
}

export default function GradientField(props: FigureProps) {
  const cols = num(props.cols, DEFAULTS.cols)
  const rows = num(props.rows, DEFAULTS.rows)
  const len = num(props.len, DEFAULTS.len)
  const arrows = useMemo(() => buildArrows(cols, rows, len), [cols, rows, len])
  const { activePart } = useFigureHighlight(props.figureId)
  // Marker ids are document-global in SVG; scope them per instance so two
  // copies of this figure on one page don't fight over the same defs.
  const uid = useId()

  return (
    <svg
      viewBox="0 0 480 320"
      width="100%"
      role="img"
      aria-label="Grid of arrows showing the negative gradient of a loss surface; arrows point downhill toward two valleys."
      style={{ maxHeight: 320 }}
    >
      <defs>
        <marker
          id={`${uid}-arrowhead-dim`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--text-2)" />
        </marker>
        <marker
          id={`${uid}-arrowhead-active`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>

      {arrows.map((a, i) => {
        const isActiveCluster = activePart != null && a.partId === activePart
        // Dim non-active arrows when a cluster is highlighted; keep
        // them visible so the field context isn't lost.
        const dimWhenInactive = activePart != null && !isActiveCluster
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={a.x2}
            y2={a.y2}
            stroke={isActiveCluster ? 'var(--accent)' : 'var(--text-2)'}
            strokeWidth={isActiveCluster ? 2 : 1.5}
            markerEnd={
              isActiveCluster
                ? `url(#${uid}-arrowhead-active)`
                : `url(#${uid}-arrowhead-dim)`
            }
            opacity={
              isActiveCluster
                ? 1
                : dimWhenInactive
                  ? 0.18
                  : 0.4 + 0.6 * a.mag
            }
            style={{ transition: 'opacity 0.2s, stroke 0.2s' }}
          />
        )
      })}
    </svg>
  )
}

function buildArrows(cols: number, rows: number, len: number) {
  const w = 480
  const h = 320
  const arrows: {
    x: number
    y: number
    x2: number
    y2: number
    mag: number
    partId: string | null
  }[] = []

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols) * w
      const y = ((j + 0.5) / rows) * h
      const nx = (i / (cols - 1)) * 2 - 1
      const ny = (j / (rows - 1)) * 2 - 1

      // Downhill direction: negative gradient of the shared surface.
      const [gx, gy] = grad(nx, ny)
      const norm = Math.hypot(gx, gy) || 1
      const ux = -gx / norm
      const uy = -gy / norm

      // Arrows inside the deeper well's basin get tagged so a term can
      // highlight them specifically.
      const distToWell = Math.hypot(nx - DEEP_WELL.x, ny - DEEP_WELL.y)

      arrows.push({
        x,
        y,
        x2: x + ux * len,
        y2: y + uy * len,
        mag: Math.min(1, norm),
        partId: distToWell < DEEP_WELL.radius ? 'well' : null,
      })
    }
  }
  return arrows
}
