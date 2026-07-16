import { useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useFigureHighlight } from '../store'
import { EDIT_ENABLED, saveContentFile } from '../lib/EditContext'
import { getBakedFigure } from '../lib/bakedFigures'

// Generic editorial diagram on React Flow. Figure components declare the
// machine-owned semantics (node ids, labels, edges, default positions)
// and delegate rendering here; the author-owned arrangement (positions,
// viewport) lives in content/figures/<figure-id>.json, merged by node id
// at render time. Regenerating a diagram's code never clobbers the
// author's layout, and nodes added later fall back to their code-defined
// positions until the author arranges them.
//
// For readers the diagram is locked: no dragging, no panning, wheel
// events scroll the page. In dev, "arrange" unlocks dragging and
// pan/zoom; "save layout" bakes positions + the exact viewport to JSON
// through the same save endpoint as prose edits (auto-committed). The
// reader sees precisely the framing the author saved — baking isn't a
// separate step, it's just what saving means.

export type DiagramNode = {
  id: string
  label: string
  // Code-defined fallback position, used until a baked layout exists.
  position: { x: number; y: number }
}

export type DiagramEdge = {
  id?: string
  source: string
  target: string
  animated?: boolean
  type?: string
}

type Props = {
  figureId: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  height?: number
}

export default function DiagramFigure(props: Props) {
  // useReactFlow (for viewport capture) requires a provider above it.
  return (
    <ReactFlowProvider>
      <DiagramInner {...props} />
    </ReactFlowProvider>
  )
}

function DiagramInner({ figureId, nodes: nodeDefs, edges: edgeDefs, height = 280 }: Props) {
  const { activePart } = useFigureHighlight(figureId)
  const baked = getBakedFigure(figureId)
  const [arranging, setArranging] = useState(false)
  const [saving, setSaving] = useState(false)
  const { getViewport } = useReactFlow()

  // Merge author-owned layout over machine-owned defaults by node id.
  const initialNodes = useMemo<Node[]>(
    () =>
      nodeDefs.map((d) => ({
        id: d.id,
        position: baked?.layout?.[d.id] ?? d.position,
        data: { label: d.label },
      })),
    [nodeDefs, baked],
  )
  const [nodes, setNodes] = useState<Node[]>(initialNodes)
  useEffect(() => setNodes(initialNodes), [initialNodes])

  const edges = useMemo<Edge[]>(
    () =>
      edgeDefs.map((e, i) => ({
        id: e.id ?? `e${i}-${e.source}-${e.target}`,
        ...e,
      })),
    [edgeDefs],
  )

  const styledNodes = nodes.map((n) => ({
    ...n,
    style: styleFor(n.id, activePart),
  }))

  const onNodesChange = (changes: NodeChange[]) =>
    setNodes((nds) => applyNodeChanges(changes, nds))

  const saveLayout = async () => {
    setSaving(true)
    try {
      const layout = Object.fromEntries(
        nodes.map((n) => [
          n.id,
          { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        ]),
      )
      const vp = getViewport()
      const viewport = {
        x: Math.round(vp.x),
        y: Math.round(vp.y),
        zoom: Math.round(vp.zoom * 1000) / 1000,
      }
      await saveContentFile(
        `figures/${figureId}.json`,
        JSON.stringify({ figure: figureId, layout, viewport }, null, 2),
      )
      setArranging(false)
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(`Could not save layout: ${String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ height }}>
        <ReactFlow
          nodes={styledNodes}
          edges={edges}
          colorMode="system"
          proOptions={{ hideAttribution: true }}
          // Reader mode is locked down (see header comment); arrange mode
          // unlocks dragging and pan/zoom so the author can compose the
          // exact framing readers will get.
          onNodesChange={onNodesChange}
          nodesDraggable={arranging}
          nodesConnectable={false}
          elementsSelectable={arranging}
          panOnDrag={arranging}
          zoomOnScroll={arranging}
          zoomOnPinch={arranging}
          zoomOnDoubleClick={false}
          panOnScroll={false}
          // React Flow defaults to 15; a gentler edge pan keeps a dragged
          // node from accelerating away from the pointer in a small figure.
          autoPanSpeed={4}
          preventScrolling={arranging}
          fitView={!baked?.viewport}
          defaultViewport={baked?.viewport}
        >
          <Background gap={20} color="var(--border)" />
        </ReactFlow>
      </div>
      {EDIT_ENABLED && (
        <div className="mn-diagram-bar">
          {arranging ? (
            <>
              <span>drag nodes · scroll to zoom · drag canvas to pan</span>
              <button type="button" disabled={saving} onClick={() => void saveLayout()}>
                {saving ? 'Saving…' : 'Save layout'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNodes(initialNodes)
                  setArranging(false)
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setArranging(true)}>
              arrange
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const baseNodeStyle: React.CSSProperties = {
  fontFamily: 'var(--heading-font)',
  fontSize: 13,
  background: 'var(--fig-bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '0.4rem 0.8rem',
  color: 'var(--text)',
  transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
}

const activeNodeStyle: React.CSSProperties = {
  ...baseNodeStyle,
  border: '2px solid var(--accent)',
  background: 'var(--accent-light)',
  boxShadow: '0 0 0 3px var(--accent-light)',
}

function styleFor(nodeId: string, activePart: string | null | undefined) {
  return activePart === nodeId ? activeNodeStyle : baseNodeStyle
}
