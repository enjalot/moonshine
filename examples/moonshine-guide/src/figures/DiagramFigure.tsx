import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useFigureHighlight } from '../store'
import { EDIT_ENABLED } from '../lib/EditContext'
import { getBakedFigure } from '../lib/bakedFigures'
import { place, type Placement } from './diagram/layout'
import { buildEdges, buildNodes, edgeTypes, frameFor, nodeTypes } from './diagram/flow'
import type { BakedDiagram, DiagramSpec } from './diagram/spec'

export type { DiagramSpec } from './diagram/spec'

// Editorial diagrams: system diagrams, pipelines, anything node-link.
//
// Semantics are machine-owned: a figure file declares a DiagramSpec (node
// ids, labels, kinds, groups, edges, optional reader-facing `detail`) and
// passes it here. The arrangement is author-owned: in dev, "arrange" opens
// a full-screen editor (snap + alignment guides, resize, auto-layout, edge
// sides, text/note annotations, undo, a crop frame) and Save writes
// content/figures/<figure-id>.json. Readers get a live React Flow diagram
// built from both, at the article's type size: hovering a node with a
// `detail` shows it, and :term[word]{to=figure-id.part} highlights a node,
// group, edge (`from--to`) or annotation.
//
// Nodes the author hasn't placed yet (added to the spec later) are laid out
// by ELK next to their neighbours; ELK only loads when that happens.

const MIN_ZOOM = 0.65

const DiagramArrange = import.meta.env.DEV ? lazy(() => import('./diagram/DiagramArrange')) : null

type Props = {
  figureId: string
  spec: DiagramSpec
}

export default function DiagramFigure({ figureId, spec }: Props) {
  const { activePart } = useFigureHighlight(figureId)
  const baked = getBakedFigure(figureId) as BakedDiagram | null
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [arranging, setArranging] = useState(false)

  useEffect(() => {
    let live = true
    void place(spec, baked).then((p) => live && setPlacement(p))
    return () => {
      live = false
    }
  }, [spec, baked])

  const unarranged = placement ? Object.values(placement.nodes).filter((n) => n.unarranged).length : 0

  return (
    <div className="mn-diagram">
      {placement ? (
        <ReactFlowProvider>
          <ReaderFlow spec={spec} placement={placement} baked={baked} activePart={activePart} />
        </ReactFlowProvider>
      ) : (
        <div className="mn-diagram-loading" />
      )}
      {EDIT_ENABLED && DiagramArrange && (
        <div className="mn-diagram-bar">
          {unarranged > 0 && (
            <span>
              {unarranged} node{unarranged > 1 ? 's' : ''} placed automatically
            </span>
          )}
          <button type="button" onClick={() => setArranging(true)}>
            arrange
          </button>
          {arranging && placement && (
            <Suspense fallback={<span>loading editor…</span>}>
              <DiagramArrange
                figureId={figureId}
                spec={spec}
                baked={baked}
                placement={placement}
                onClose={() => setArranging(false)}
              />
            </Suspense>
          )}
        </div>
      )}
    </div>
  )
}

function ReaderFlow({
  spec,
  placement,
  baked,
  activePart,
}: {
  spec: DiagramSpec
  placement: Placement
  baked: BakedDiagram | null
  activePart?: string | null
}) {
  // Measured on the scroll container: the column width available.
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nodes = useMemo(() => buildNodes(spec, placement, baked, { activePart }), [spec, placement, baked, activePart])
  const edges = useMemo(() => buildEdges(spec, baked, activePart), [spec, baked, activePart])
  const frame = useMemo(() => frameFor(spec, placement, baked), [spec, placement, baked])

  // Never scale above 1 (labels stay at the article's type size), and
  // never below MIN_ZOOM: on a narrow screen a wide diagram scrolls
  // sideways like a wide table instead of shrinking to unreadable text.
  const zoom = width ? Math.max(MIN_ZOOM, Math.min(1, width / frame.w)) : 1
  const inner = Math.max(width, Math.ceil(frame.w * zoom))
  const viewport = {
    x: -frame.x * zoom + Math.max(0, (inner - frame.w * zoom) / 2),
    y: -frame.y * zoom,
    zoom,
  }

  return (
    <div ref={ref} className="mn-diagram-scroll">
      <div
        className="mn-diagram-flow"
        style={{ height: Math.ceil(frame.h * zoom), width: inner || '100%' }}
        role="img"
        aria-label={spec.nodes.map((n) => n.label).join(', ')}
      >
        {width > 0 && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            viewport={viewport}
            minZoom={0.05}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            preventScrolling={false}
          />
        )}
      </div>
    </div>
  )
}
