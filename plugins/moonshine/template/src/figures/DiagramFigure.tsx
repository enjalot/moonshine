import { lazy, Suspense, useEffect, useState } from 'react'
import { useFigureHighlight } from '../store'
import { EDIT_ENABLED } from '../lib/EditContext'
import { getBakedFigure } from '../lib/bakedFigures'
import { place, type Placement } from './diagram/layout'
import SpecSvg from './diagram/SpecSvg'
import { specHash, type BakedDiagram, type DiagramSpec } from './diagram/spec'

export type { DiagramSpec } from './diagram/spec'

// Editorial diagrams: system diagrams, pipelines, and anything an author
// wants to draw by hand.
//
// Semantics are machine-owned: a figure file declares a DiagramSpec (node
// ids, labels, kinds, groups, edges) and passes it here. The arrangement
// is author-owned: in dev, "arrange" opens a full-screen tldraw editor
// where the author drags, restyles, sketches, and annotates; Save bakes a
// light and a dark SVG to content/figures/<figure-id>.json (and the tldraw
// document next to it, under figures/tldraw/). Readers get that SVG —
// tldraw itself never ships in a production build.
//
// Before the first save, or after the agent changes the spec, readers get
// a plain-SVG rendering of the spec (auto-laid out by ELK, using the
// author's saved positions where they exist), so the figure is never
// blank and never shows stale labels.
//
// A figure with no spec is a free drawing: the author draws from scratch.
//
// :term[word]{to=figure-id.part} highlights a part: any spec node, group,
// or edge id (edge ids default to `from--to`).

const DiagramEditor = import.meta.env.DEV ? lazy(() => import('./diagram/DiagramEditor')) : null

type Props = {
  figureId: string
  spec?: DiagramSpec
}

export default function DiagramFigure({ figureId, spec }: Props) {
  const { activePart } = useFigureHighlight(figureId)
  const baked = getBakedFigure(figureId) as BakedDiagram | null
  const [editing, setEditing] = useState(false)
  const fresh = Boolean(baked?.svg) && (!spec || baked?.specHash === specHash(spec))

  return (
    <div className="mn-diagram">
      {fresh && baked?.svg ? (
        <BakedSvg svg={baked.svg} parts={baked.parts} activePart={activePart} />
      ) : spec ? (
        <SpecView spec={spec} baked={baked} activePart={activePart} />
      ) : EDIT_ENABLED ? (
        <p className="mn-diagram-empty">Nothing drawn yet. Click “draw” to open the editor.</p>
      ) : null}
      {EDIT_ENABLED && DiagramEditor && (
        <div className="mn-diagram-bar">
          {baked?.svg && !fresh && <span>the spec changed since this layout was saved</span>}
          <button type="button" onClick={() => setEditing(true)}>
            {spec ? 'arrange' : 'draw'}
          </button>
          {editing && (
            <Suspense fallback={<span>loading editor…</span>}>
              <DiagramEditor figureId={figureId} spec={spec} onClose={() => setEditing(false)} />
            </Suspense>
          )}
        </div>
      )}
    </div>
  )
}

function BakedSvg({
  svg,
  parts,
  activePart,
}: {
  svg: NonNullable<BakedDiagram['svg']>
  parts?: BakedDiagram['parts']
  activePart?: string | null
}) {
  const box = activePart ? parts?.[activePart] : undefined
  return (
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
  )
}

function SpecView({
  spec,
  baked,
  activePart,
}: {
  spec: DiagramSpec
  baked: BakedDiagram | null
  activePart?: string | null
}) {
  const [placement, setPlacement] = useState<Placement | null>(null)
  useEffect(() => {
    let live = true
    void place(spec, baked).then((p) => live && setPlacement(p))
    return () => {
      live = false
    }
  }, [spec, baked])
  if (!placement) return <div className="mn-diagram-loading" />
  return <SpecSvg spec={spec} placement={placement} activePart={activePart} />
}
