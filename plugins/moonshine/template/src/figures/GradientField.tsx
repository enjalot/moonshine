import { useMemo } from 'react'
import { useFigureHighlight } from '../store'

// Vector field on a 14×10 grid. Arrows point in the negative-gradient
// direction (downhill) of a synthetic two-well loss surface. Arrows
// inside the basin of the deeper well are tagged `partId: 'well'`, so
// a `:term[gradient]{to=gradient-field.well}` markdown link can light
// up just that cluster instead of outlining the whole figure.
export default function GradientField() {
  const arrows = useMemo(() => buildArrows(), [])
  const { activePart } = useFigureHighlight('gradient-field')

  return (
    <svg viewBox="0 0 480 320" width="100%" style={{ maxHeight: 320 }}>
      <defs>
        <marker
          id="gf-arrowhead-dim"
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
          id="gf-arrowhead-active"
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
                ? 'url(#gf-arrowhead-active)'
                : 'url(#gf-arrowhead-dim)'
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

function buildArrows() {
  const w = 480
  const h = 320
  const cols = 14
  const rows = 10
  const arrows: {
    x: number
    y: number
    x2: number
    y2: number
    mag: number
    partId: string | null
  }[] = []
  const len = 18
  // The deeper well of the synthetic surface sits near (0.5, -0.2)
  // in [-1, 1] normalized coordinates; arrows inside this basin get
  // tagged so a term can highlight them specifically.
  const wellX = 0.5
  const wellY = -0.2
  const wellRadius = 0.55

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols) * w
      const y = ((j + 0.5) / rows) * h
      const nx = (i / (cols - 1)) * 2 - 1
      const ny = (j / (rows - 1)) * 2 - 1

      // Negative gradient of the two-well surface used in LossLandscape.
      const gx =
        2 * (nx + 0.6) * Math.exp(-((nx + 0.6) ** 2 + ny ** 2)) * 0.6 +
        2 * (nx - 0.5) * Math.exp(-((nx - 0.5) ** 2 + (ny + 0.2) ** 2)) * 0.8
      const gy =
        2 * ny * Math.exp(-((nx + 0.6) ** 2 + ny ** 2)) * 0.6 +
        2 * (ny + 0.2) * Math.exp(-((nx - 0.5) ** 2 + (ny + 0.2) ** 2)) * 0.8

      const norm = Math.hypot(gx, gy) || 1
      const ux = -gx / norm
      const uy = -gy / norm

      const distToWell = Math.hypot(nx - wellX, ny - wellY)

      arrows.push({
        x,
        y,
        x2: x + ux * len,
        y2: y + uy * len,
        mag: Math.min(1, norm),
        partId: distToWell < wellRadius ? 'well' : null,
      })
    }
  }
  return arrows
}
