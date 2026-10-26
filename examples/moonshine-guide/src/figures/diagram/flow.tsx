import { createContext, memo, useContext, useEffect, useRef, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  Position,
  getSmoothStepPath,
  useInternalNode,
  useStore,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import type { Placement } from './layout'
import { edgeKey, type Annotation, type BakedDiagram, type Box, type DiagramSpec, type NodeKind, type Side } from './spec'

// Shared React Flow pieces for DiagramFigure (reader, locked) and
// DiagramArrange (dev editor). Everything is styled from tokens.css via
// the .mn-flow-* classes in article.css, so diagrams follow light/dark
// mode and the article's type with no baking step.

// ---- ids --------------------------------------------------------------
// Spec node ids are used as-is (they are term targets); groups,
// annotations and the crop frame get prefixes so they can't collide.
export const groupNodeId = (id: string) => `g:${id}`
export const annotNodeId = (id: string) => `a:${id}`
export const FRAME_ID = 'frame:crop'

// ---- editor hooks -----------------------------------------------------
// The dev editor (DiagramArrange) provides this; readers never do, so
// every editing affordance below is gated on it.
export type DiagramEditUi = {
  // The node, group or annotation whose text is being edited in place.
  editing: string | null
  commitText: (id: string, text: string | null) => void // null = cancel
  selectedEdge: string | null
  editingEdge: string | null
  commitEdgeLabel: (key: string, label: string | null) => void
  // The arrow whose end is being dragged (the editor draws it instead).
  draggingEdge: string | null
}
export const DiagramEditContext = createContext<DiagramEditUi | null>(null)

export type SpecNodeData = {
  label: string
  kind: NodeKind
  detail?: string
  active?: boolean
  editable?: boolean
  unarranged?: boolean
  onResizeStart?: () => void
}
export type GroupNodeData = { label: string; active?: boolean; editable?: boolean; onResizeStart?: () => void }
export type AnnotNodeData = {
  kind: Annotation['kind']
  text: string
  active?: boolean
  editable?: boolean
  onResizeStart?: () => void
}
export type FlowEdgeData = {
  label?: string
  dashed?: boolean
  source?: Side
  target?: Side
  active?: boolean
  direction: 'RIGHT' | 'DOWN'
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
const POS: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

// Invisible handles on every side: edges are drawn by FlowEdge from node
// geometry, but React Flow still wants a handle to anchor an edge to. In
// the editor the source handles become connect dots (ConnectionMode.Loose
// lets a drag end on any of them).
function SideHandles({ connectable }: { connectable?: boolean }) {
  return (
    <>
      {SIDES.map((s) => (
        <Handle
          key={`s-${s}`}
          id={s}
          type="source"
          position={POS[s]}
          className={connectable ? 'mn-flow-handle mn-flow-handle--connect' : 'mn-flow-handle'}
          isConnectable={Boolean(connectable)}
        />
      ))}
      {SIDES.map((s) => (
        <Handle key={`t-${s}`} id={s} type="target" position={POS[s]} className="mn-flow-handle" isConnectable={false} />
      ))}
    </>
  )
}

export const SpecNode = memo(function SpecNode({ id, data, selected }: NodeProps<Node<SpecNodeData>>) {
  const ui = useContext(DiagramEditContext)
  const editing = ui?.editing === id
  const cls = [
    'mn-flow-node',
    `mn-flow-node--${data.kind}`,
    data.active && 'is-active',
    data.unarranged && 'is-unarranged',
    data.detail && 'has-detail',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} tabIndex={data.detail && !data.editable ? 0 : undefined}>
      {data.editable && <NodeResizer isVisible={selected && !editing} onResizeStart={data.onResizeStart} minWidth={64} minHeight={32} lineClassName="mn-flow-resize-line" handleClassName="mn-flow-resize-handle" />}
      <SideHandles connectable={data.editable} />
      {editing && ui ? (
        <InlineText className="mn-flow-label-edit" value={data.label} onDone={(t) => ui.commitText(id, t)} />
      ) : (
        <span className="mn-flow-label">{data.label}</span>
      )}
      {data.detail && !data.editable && (
        <span className="mn-flow-detail" role="tooltip">
          {data.detail}
        </span>
      )}
      {data.detail && data.editable && <span className="mn-flow-detail-mark" title={`Hover text: ${data.detail}`} />}
    </div>
  )
})

// In-place text editing: Enter (or clicking away) keeps, Shift+Enter is
// a new line, Escape cancels.
function InlineText({ value, onDone, className, multiline = true }: { value: string; onDone: (v: string | null) => void; className: string; multiline?: boolean }) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  useEffect(() => ref.current?.select(), [])
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <textarea
      ref={ref}
      className={`${className} nodrag nopan nowheel`}
      value={draft}
      rows={Math.max(1, draft.split('\n').length)}
      aria-label="Edit text"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          finish(null)
        } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
          e.preventDefault()
          finish(draft)
        }
      }}
    />
  )
}
export const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps<Node<GroupNodeData>>) {
  const ui = useContext(DiagramEditContext)
  const editing = ui?.editing === id
  return (
    <div className={`mn-flow-group${data.active ? ' is-active' : ''}`}>
      {data.editable && <NodeResizer isVisible={selected} onResizeStart={data.onResizeStart} minWidth={80} minHeight={60} lineClassName="mn-flow-resize-line" handleClassName="mn-flow-resize-handle" />}
      {editing && ui ? (
        <InlineText className="mn-flow-group-label mn-flow-group-label-edit" value={data.label} multiline={false} onDone={(t) => ui.commitText(id, t)} />
      ) : (
        <span className="mn-flow-group-label">{data.label}</span>
      )}
    </div>
  )
})

export const AnnotNode = memo(function AnnotNode({ id, data, selected }: NodeProps<Node<AnnotNodeData>>) {
  const ui = useContext(DiagramEditContext)
  const editing = ui?.editing === id
  return (
    <div className={`mn-flow-annot mn-flow-annot--${data.kind}${data.active ? ' is-active' : ''}`}>
      {data.editable && <NodeResizer isVisible={selected && !editing} onResizeStart={data.onResizeStart} minWidth={40} minHeight={24} lineClassName="mn-flow-resize-line" handleClassName="mn-flow-resize-handle" />}
      {editing && ui ? <InlineText className="mn-flow-annot-edit" value={data.text} onDone={(t) => ui.commitText(id, t)} /> : <span>{data.text}</span>}
    </div>
  )
})

// The reader frame: what readers see, always present in the editor.
// Outside it is dimmed. Only its border and tab take the pointer, so the
// canvas inside stays clickable. Until the author moves or resizes it, it
// follows the content (`auto`) and nothing is saved.
export type FrameNodeData = { auto: boolean; onResizeStart?: () => void }
export const FrameNode = memo(function FrameNode({ data, selected, width, height }: NodeProps<Node<FrameNodeData>>) {
  return (
    <div className={`mn-flow-frame${selected ? ' is-selected' : ''}`}>
      <NodeResizer isVisible={selected} onResizeStart={data.onResizeStart} minWidth={80} minHeight={60} lineClassName="mn-flow-resize-line" handleClassName="mn-flow-resize-handle" />
      <span className="mn-flow-frame-grip" />
      <span className="mn-flow-frame-label" title="What readers see. Drag or resize to crop; select it to fit it to the content again.">
        Reader view{data.auto ? ' · fits content' : ` · ${Math.round(width ?? 0)}×${Math.round(height ?? 0)}`}
      </span>
    </div>
  )
})

// ---- edges ------------------------------------------------------------

function boxOf(n: InternalNode): Box {
  const p = n.internals.positionAbsolute
  return { x: p.x, y: p.y, w: n.measured.width ?? (n.width as number) ?? 0, h: n.measured.height ?? (n.height as number) ?? 0 }
}

export function sidePoint(b: Box, s: Side): [number, number] {
  switch (s) {
    case 'top':
      return [b.x + b.w / 2, b.y]
    case 'bottom':
      return [b.x + b.w / 2, b.y + b.h]
    case 'left':
      return [b.x, b.y + b.h / 2]
    case 'right':
      return [b.x + b.w, b.y + b.h / 2]
  }
}

// The side of `a` that faces `b`.
export function facing(a: Box, b: Box): Side {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) / (a.w + b.w) > Math.abs(dy) / (a.h + b.h)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}

// Where the line between two box centers leaves box `b`.
function borderPoint(b: Box, tx: number, ty: number): [number, number] {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = tx - cx
  const dy = ty - cy
  const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx)
  const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy)
  const s = Math.min(sx, sy)
  return [cx + dx * s, cy + dy * s]
}

function crosses(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  for (let t = 0.06; t < 0.95; t += 0.04) {
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t
    if (x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2) return true
  }
  return false
}

export function FlowEdge({ id, source, target, data, markerEnd }: EdgeProps<Edge<FlowEdgeData>>) {
  const ui = useContext(DiagramEditContext)
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  // Other spec nodes, for the "does a straight line run through a box"
  // check. Selecting the lookup re-renders edges as nodes move, which is
  // what arranging needs; diagrams are small.
  const others = useStore((st) => {
    const out: Box[] = []
    st.nodeLookup.forEach((n) => {
      if (n.type === 'spec' && n.id !== source && n.id !== target) out.push(boxOf(n))
    })
    return out
  }, (a, b) => a.length === b.length && a.every((x, i) => x.x === b[i].x && x.y === b[i].y && x.w === b[i].w && x.h === b[i].h))
  if (!s || !t || !data) return null
  const a = boxOf(s)
  const b = boxOf(t)

  const { path, lx, ly } = edgeGeometry(a, b, data, others)

  const selected = ui?.selectedEdge === id
  const editingLabel = ui?.editingEdge === id
  if (ui?.draggingEdge === id) return null
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={ui ? 16 : 0}
        className={`mn-flow-edge${data.dashed ? ' is-dashed' : ''}${data.active || selected ? ' is-active' : ''}`}
      />
      {(data.label || editingLabel) && (
        <EdgeLabelRenderer>
          <div
            className={`mn-flow-edge-label${data.active || selected ? ' is-active' : ''}${editingLabel ? ' is-editing' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {editingLabel && ui ? (
              <InlineText className="mn-flow-edge-label-edit" value={data.label ?? ''} multiline={false} onDone={(t) => ui.commitEdgeLabel(id, t)} />
            ) : (
              data.label
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// How an edge is drawn between two boxes, shared with the editor (which
// puts its end handles on p1 / p2).
export function edgeGeometry(
  a: Box,
  b: Box,
  data: Pick<FlowEdgeData, 'source' | 'target' | 'direction'>,
  others: Box[],
): { path: string; lx: number; ly: number; p1: [number, number]; p2: [number, number] } {
  if (data.source || data.target) {
    // Author picked a side: route orthogonally out of it.
    const ss = data.source ?? facing(a, b)
    const ts = data.target ?? facing(b, a)
    const [sx, sy] = sidePoint(a, ss)
    const [tx, ty] = sidePoint(b, ts)
    const [path, lx, ly] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      sourcePosition: POS[ss],
      targetX: tx,
      targetY: ty,
      targetPosition: POS[ts],
      borderRadius: 8,
      offset: 18,
    })
    return { path, lx, ly, p1: [sx, sy], p2: [tx, ty] }
  }
  const [x1, y1] = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2)
  const [x2, y2] = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2)
  if (!others.some((o) => crosses(x1, y1, x2, y2, o))) {
    return { path: `M ${x1} ${y1} L ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2, p1: [x1, y1], p2: [x2, y2] }
  }
  if (data.direction === 'RIGHT') {
    // Bow under the row the straight line would have crossed.
    const sx = a.x + a.w / 2
    const tx = b.x + b.w / 2
    const lo = Math.min(sx, tx)
    const hi = Math.max(sx, tx)
    const floor = Math.max(a.y + a.h, b.y + b.h, ...others.filter((o) => o.x + o.w > lo && o.x < hi).map((o) => o.y + o.h))
    const y = floor + 28
    return {
      path: `M ${sx} ${a.y + a.h} C ${sx} ${y}, ${tx} ${y}, ${tx} ${b.y + b.h}`,
      lx: (sx + tx) / 2,
      ly: y - 4,
      p1: [sx, a.y + a.h],
      p2: [tx, b.y + b.h],
    }
  }
  const sy = a.y + a.h / 2
  const ty = b.y + b.h / 2
  const lo = Math.min(sy, ty)
  const hi = Math.max(sy, ty)
  const wall = Math.max(a.x + a.w, b.x + b.w, ...others.filter((o) => o.y + o.h > lo && o.y < hi).map((o) => o.x + o.w))
  const x = wall + 28
  return {
    path: `M ${a.x + a.w} ${sy} C ${x} ${sy}, ${x} ${ty}, ${b.x + b.w} ${ty}`,
    lx: x - 4,
    ly: (sy + ty) / 2,
    p1: [a.x + a.w, sy],
    p2: [b.x + b.w, ty],
  }
}

export const nodeTypes = { spec: SpecNode, group: GroupNode, annot: AnnotNode, frame: FrameNode }
export const edgeTypes = { flow: FlowEdge }

// ---- building the graph -----------------------------------------------

export function buildNodes(
  spec: DiagramSpec,
  placement: Placement,
  baked: BakedDiagram | null,
  opts: { activePart?: string | null; editable?: boolean } = {},
): Node[] {
  const { activePart, editable } = opts
  const out: Node[] = []
  for (const g of spec.groups ?? []) {
    const b = placement.groups[g.id]
    if (!b) continue
    out.push({
      id: groupNodeId(g.id),
      type: 'group',
      position: { x: b.x, y: b.y },
      width: b.w,
      height: b.h,
      zIndex: -1,
      data: { label: g.label, active: activePart === g.id, editable },
      selectable: editable,
      draggable: editable,
    })
  }
  for (const n of spec.nodes) {
    const b = placement.nodes[n.id]
    if (!b) continue
    const parent = n.group ? placement.groups[n.group] : undefined
    out.push({
      id: n.id,
      type: 'spec',
      parentId: parent ? groupNodeId(n.group as string) : undefined,
      position: parent ? { x: b.x - parent.x, y: b.y - parent.y } : { x: b.x, y: b.y },
      width: b.w,
      height: b.h,
      data: {
        label: n.label,
        kind: n.kind ?? 'process',
        detail: n.detail,
        active: activePart === n.id,
        editable,
        unarranged: editable && b.unarranged,
      },
      selectable: editable,
      draggable: editable,
    })
  }
  for (const a of baked?.annotations ?? []) {
    out.push({
      id: annotNodeId(a.id),
      type: 'annot',
      position: { x: a.x, y: a.y },
      width: a.w,
      height: a.h,
      data: { kind: a.kind, text: a.text, active: activePart === a.id, editable },
      selectable: editable,
      draggable: editable,
    })
  }
  return out
}

export function buildEdges(
  spec: DiagramSpec,
  baked: BakedDiagram | null,
  activePart?: string | null,
  sides?: BakedDiagram['edges'],
): Edge[] {
  const ids = new Set(spec.nodes.map((n) => n.id))
  const s = sides ?? baked?.edges ?? {}
  return spec.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => {
      const key = edgeKey(e)
      const active = activePart === key
      return {
        id: key,
        source: e.from,
        target: e.to,
        sourceHandle: s[key]?.source ?? 'right',
        targetHandle: s[key]?.target ?? 'left',
        type: 'flow',
        animated: e.animated,
        markerEnd: { type: 'arrowclosed', width: 16, height: 16, color: active ? 'var(--accent)' : 'var(--text-2)' },
        data: {
          label: e.label,
          dashed: e.dashed,
          source: s[key]?.source,
          target: s[key]?.target,
          active,
          direction: spec.direction ?? 'RIGHT',
        },
      } as Edge
    })
}

// Everything the reader should see: saved frame, else the bounds of all
// boxes plus a margin.
export function frameOf(placement: Placement, baked: BakedDiagram | null, margin = 16): Box {
  if (baked?.frame) return baked.frame
  const boxes: Box[] = [
    ...Object.values(placement.nodes),
    ...Object.values(placement.groups),
    ...(baked?.annotations ?? []),
  ]
  if (!boxes.length) return { x: 0, y: 0, w: 100, h: 60 }
  const x0 = Math.min(...boxes.map((b) => b.x)) - margin
  const y0 = Math.min(...boxes.map((b) => b.y)) - margin
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + margin
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + margin
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// Default frame that also leaves room for edges that bow around a row
// (the same crossing test FlowEdge uses).
export function frameFor(spec: DiagramSpec, placement: Placement, baked: BakedDiagram | null): Box {
  const f = frameOf(placement, baked)
  if (baked?.frame) return f
  const sides = baked?.edges ?? {}
  const boxes = placement.nodes
  const bows = spec.edges.some((e) => {
    const a = boxes[e.from]
    const b = boxes[e.to]
    if (!a || !b || sides[edgeKey(e)]) return false
    const [x1, y1] = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2)
    const [x2, y2] = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2)
    return Object.entries(boxes).some(([id, o]) => id !== e.from && id !== e.to && crosses(x1, y1, x2, y2, o))
  })
  if (!bows) return f
  return (spec.direction ?? 'RIGHT') === 'RIGHT' ? { ...f, h: f.h + 40 } : { ...f, w: f.w + 40 }
}
