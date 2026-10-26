import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useFigureHighlight } from '../store'
import { EDIT_ENABLED } from '../lib/EditContext'
import { getBakedFigure } from '../lib/bakedFigures'
import { narrowSpec, place, type Placement } from './diagram/layout'
import { buildEdges, buildNodes, edgeTypes, frameFor, nodeTypes } from './diagram/flow'
import type { BakedDiagram, Box, DiagramSpec } from './diagram/spec'

export type { DiagramSpec } from './diagram/spec'

// Editorial diagrams: system diagrams, pipelines, anything node-link.
//
// Semantics are machine-owned: a figure file declares a DiagramSpec (node
// ids, labels, kinds, groups, edges, optional reader-facing `detail`) and
// passes it here. The arrangement is author-owned: in dev, "arrange" opens
// a full-screen editor (snap + alignment guides, resize, auto-layout, edge
// sides, text/note annotations, undo, a crop frame) and Save writes
// content/figures/<figure-id>.json. Readers get a live React Flow diagram
// built from both: hovering a node with a `detail` shows it, and
// :term[word]{to=figure-id.part} highlights a node, group, edge
// (`from--to`) or annotation.
//
// Nodes the author hasn't placed yet (added to the spec later) are laid out
// by ELK next to their neighbours; ELK only loads when that happens.
//
// Readability is a floor, not a hope: node labels are LABEL_PX at full
// size and never render below MIN_LABEL_PX. In order, a diagram too wide
// for the column
//   1. breaks out into the figure gutter on desktop (like .figure-wide),
//   2. shrinks, down to the floor,
//   3. switches to its narrow arrangement (saved by the author, or an
//      automatic top-to-bottom layout) if that reads larger,
//   4. scrolls sideways at the floor, like a wide table.
// The rendered label size is on the element as data-label-px;
// scripts/check-diagrams.mjs in the moonshine repo measures it.

const LABEL_PX = 15 // .mn-flow-node font-size in article.css
const MIN_LABEL_PX = 13 // the figure-caption size: the smallest text we ship
const MIN_ZOOM = MIN_LABEL_PX / LABEL_PX

const DiagramArrange = import.meta.env.DEV ? lazy(() => import('./diagram/DiagramArrange')) : null

// Pre-0.8 API: React Flow-style nodes with code positions, and edges by
// source/target. Still accepted so existing figure files keep working;
// scripts/upgrade-still.mjs reports them for conversion to a spec.
export type DiagramNode = { id: string; label: string; position: { x: number; y: number } }
export type DiagramEdge = { id?: string; source: string; target: string; animated?: boolean; type?: string; label?: string }

type Props = {
  figureId: string
  spec?: DiagramSpec
  nodes?: DiagramNode[]
  edges?: DiagramEdge[]
  height?: number
  // kind=diagram figures: the spec lives in the saved JSON, not in code.
  authored?: boolean
}

const EMPTY_SPEC: DiagramSpec = { nodes: [], edges: [] }

export default function DiagramFigure({ figureId, spec: specProp, nodes: legacyNodes, edges: legacyEdges, authored }: Props) {
  const { activePart } = useFigureHighlight(figureId)
  const saved = getBakedFigure(figureId)
  const legacy = useMemo(
    () => (specProp || !legacyNodes ? null : fromLegacy(legacyNodes, legacyEdges ?? [])),
    [specProp, legacyNodes, legacyEdges],
  )
  const spec = authored ? (saved?.spec ?? EMPTY_SPEC) : (specProp ?? legacy?.spec ?? EMPTY_SPEC)
  // Legacy code positions stand in for any node the author never saved.
  const baked = useMemo<BakedDiagram | null>(
    () => (legacy ? { figure: figureId, ...saved, nodes: { ...legacy.positions, ...saved?.nodes } } : saved),
    [legacy, saved, figureId],
  )
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
  const empty = spec.nodes.length === 0

  return (
    <div className="mn-diagram">
      {empty ? (
        EDIT_ENABLED && <p className="mn-diagram-empty">An empty diagram. Click “arrange” to add boxes.</p>
      ) : placement ? (
        <ReaderFlow spec={spec} placement={placement} baked={baked} activePart={activePart} />
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
          {legacy && <span title="Run scripts/upgrade-still.mjs from the moonshine plugin">old diagram API</span>}
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
                authored={authored}
                onClose={() => setArranging(false)}
              />
            </Suspense>
          )}
        </div>
      )}
    </div>
  )
}

type View = { spec: DiagramSpec; placement: Placement; baked: BakedDiagram | null; frame: Box }

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

  const wide = useMemo<View>(() => ({ spec, placement, baked, frame: frameFor(spec, placement, baked) }), [spec, placement, baked])
  // Sticky: breaking out widens the column, which could make the diagram
  // fit and flip it back. Once out, it stays out (CSS ignores the class
  // on screens without a gutter).
  const [breakout, setBreakout] = useState(false)
  useEffect(() => {
    if (width && wide.frame.w > width) setBreakout(true)
  }, [width, wide.frame.w])
  const needsNarrow = width > 0 && width / wide.frame.w < MIN_ZOOM
  const narrow = useNarrowView(spec, baked, needsNarrow)

  // Full size when it fits; otherwise the largest zoom at or above the
  // floor, preferring the wide arrangement (the author's) when both fit.
  const fit = (v: View) => Math.min(1, width / v.frame.w)
  let view = wide
  if (needsNarrow && narrow && fit(narrow) > fit(wide)) view = narrow
  const zoom = width ? Math.max(MIN_ZOOM, fit(view)) : 1
  const scrolls = width > 0 && view.frame.w * zoom > width + 0.5

  const nodes = useMemo(() => buildNodes(view.spec, view.placement, view.baked, { activePart }), [view, activePart])
  const edges = useMemo(() => buildEdges(view.spec, view.baked, activePart), [view, activePart])

  const frame = view.frame
  const inner = Math.max(width, Math.ceil(frame.w * zoom))
  const viewport = {
    x: -frame.x * zoom + Math.max(0, (inner - frame.w * zoom) / 2),
    y: -frame.y * zoom,
    zoom,
  }

  return (
    <div
      ref={ref}
      className={`mn-diagram-scroll${scrolls ? ' is-scrolling' : ''}${breakout ? ' wants-wide' : ''}`}
      tabIndex={scrolls ? 0 : undefined}
    >
      <div
        className="mn-diagram-flow"
        style={{ height: Math.ceil(frame.h * zoom), width: inner || '100%' }}
        role="img"
        aria-label={spec.nodes.map((n) => n.label).join(', ')}
        data-label-px={(LABEL_PX * zoom).toFixed(2)}
        data-layout={view === wide ? 'wide' : 'narrow'}
      >
        {width > 0 && (
          <ReactFlowProvider>
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
          </ReactFlowProvider>
        )}
      </div>
      {scrolls && <p className="mn-diagram-scroll-hint">scroll sideways for the rest of the diagram →</p>}
    </div>
  )
}

// The narrow arrangement, computed only when a screen needs it: the
// author's saved `narrow` if any, else the spec laid out top to bottom.
// Either way the narrow view routes edges for a top-to-bottom flow.
// An automatic layout carries no annotations (their positions belong to
// the wide arrangement), so a diagram with annotations and no saved
// narrow arrangement stays wide and scrolls instead.
function useNarrowView(spec: DiagramSpec, baked: BakedDiagram | null, wanted: boolean): View | null {
  const [view, setView] = useState<View | null>(null)
  const auto = !baked?.narrow
  const blocked = auto && Boolean(baked?.annotations?.length)
  useEffect(() => {
    if (!wanted || blocked) return
    let live = true
    const s = narrowSpec(spec)
    const b: BakedDiagram = { figure: baked?.figure ?? '', ...(baked?.narrow ?? {}) }
    void place(s, b).then((p) => live && setView({ spec: s, placement: p, baked: b, frame: frameFor(s, p, b) }))
    return () => {
      live = false
    }
  }, [wanted, blocked, auto, spec, baked])
  return wanted && !blocked ? view : null
}

function fromLegacy(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const spec: DiagramSpec = {
    nodes: nodes.map((n) => ({ id: n.id, label: n.label })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, animated: e.animated, label: e.label })),
  }
  const positions: Record<string, Box> = {}
  for (const n of nodes) positions[n.id] = { x: n.position.x, y: n.position.y, w: 0, h: 0 }
  return { spec, positions }
}
