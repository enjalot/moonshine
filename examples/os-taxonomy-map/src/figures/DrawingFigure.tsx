import { lazy, Suspense, useState } from 'react'
import { useFigureHighlight } from '../store'
import { EDIT_ENABLED } from '../lib/EditContext'
import { getBakedFigure } from '../lib/bakedFigures'
import type { BakedDiagram } from './diagram/spec'
import type { FigureProps } from './registry'

// Built-in figure kind for free drawings: `:::figure{id=anything kind=drawing}`
// needs no registry entry (Figure.tsx falls back to this). Usually created
// with the "+" between blocks in dev. The author draws in tldraw; readers
// get the baked light/dark SVG with the article's fonts. Shapes tagged with
// meta.partId are :term targets.

const DrawingEditor = import.meta.env.DEV ? lazy(() => import('./diagram/DrawingEditor')) : null

export default function DrawingFigure({ figureId }: FigureProps) {
  const { activePart } = useFigureHighlight(figureId)
  const baked = getBakedFigure(figureId) as BakedDiagram | null
  const [editing, setEditing] = useState(false)
  const svg = baked?.svg
  const box = activePart ? baked?.parts?.[activePart] : undefined

  return (
    <div className="mn-diagram">
      {svg ? (
        <div className="mn-diagram-baked" style={{ maxWidth: svg.width }}>
          {/* Both themes are inlined; CSS shows the one matching the page. */}
          <div className="mn-diagram-light" dangerouslySetInnerHTML={{ __html: svg.light }} />
          <div className="mn-diagram-dark" dangerouslySetInnerHTML={{ __html: svg.dark }} />
          <svg className="mn-diagram-overlay" viewBox={svg.viewBox} aria-hidden="true">
            {box && (
              <rect
                x={box.x - 6}
                y={box.y - 6}
                width={box.w + 12}
                height={box.h + 12}
                rx={8}
                fill="var(--accent)"
                fillOpacity={0.12}
                stroke="var(--accent)"
                strokeWidth={2}
              />
            )}
          </svg>
        </div>
      ) : EDIT_ENABLED ? (
        <p className="mn-diagram-empty">Nothing drawn yet. Click “draw” to open the editor.</p>
      ) : null}
      {EDIT_ENABLED && DrawingEditor && (
        <div className="mn-diagram-bar">
          <button type="button" onClick={() => setEditing(true)}>
            draw
          </button>
          {editing && (
            <Suspense fallback={<span>loading editor…</span>}>
              <DrawingEditor figureId={figureId} onClose={() => setEditing(false)} />
            </Suspense>
          )}
        </div>
      )}
    </div>
  )
}
