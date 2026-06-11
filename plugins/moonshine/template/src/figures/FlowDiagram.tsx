import { useMemo } from 'react'
import ReactFlow, {
  Background,
  type Node,
  type Edge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useFigureHighlight } from '../store'
import type { FigureProps } from './registry'

// React Flow is the recommended path for node-link diagrams. Each node
// is a real React component, so a `:term[step size]{to=flow-diagram.update}`
// markdown link can light up exactly the node whose label contains the
// step-size parameter (η) instead of just outlining the whole diagram.
//
// Keep diagrams editorial: ~3–8 nodes, no scroll. If you're approaching
// dozens, you're building a tool, not an article.
export default function FlowDiagram({ figureId }: FigureProps) {
  const { activePart } = useFigureHighlight(figureId)

  const nodes = useMemo<Node[]>(
    () => [
      {
        id: 'input',
        position: { x: 0, y: 60 },
        data: { label: 'Parameters θ' },
        style: styleFor('input', activePart),
      },
      {
        id: 'loss',
        position: { x: 200, y: 0 },
        data: { label: 'Loss L(θ)' },
        style: styleFor('loss', activePart),
      },
      {
        id: 'grad',
        position: { x: 200, y: 120 },
        data: { label: 'Gradient ∇L' },
        style: styleFor('grad', activePart),
      },
      {
        id: 'update',
        position: { x: 420, y: 60 },
        data: { label: 'θ ← θ − η∇L' },
        style: styleFor('update', activePart),
      },
    ],
    [activePart],
  )

  const edges = useMemo<Edge[]>(
    () => [
      { id: 'a', source: 'input', target: 'loss', animated: true },
      { id: 'b', source: 'input', target: 'grad', animated: true },
      { id: 'c', source: 'loss', target: 'grad' },
      { id: 'd', source: 'grad', target: 'update', animated: true },
      { id: 'e', source: 'update', target: 'input', type: 'smoothstep' },
    ],
    [],
  )

  return (
    <div style={{ height: 280 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        // Editorial figure: the reader looks at it, terms highlight nodes
        // in it, but it is not a canvas to rearrange. Lock everything down
        // and let wheel events scroll the page (preventScrolling would
        // swallow them and create a dead band in the article's scroll).
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        panOnScroll={false}
        preventScrolling={false}
      >
        <Background gap={20} color="var(--border)" />
      </ReactFlow>
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
