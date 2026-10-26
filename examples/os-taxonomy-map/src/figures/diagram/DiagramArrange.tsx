import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type OnBeforeDelete,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { saveContentFile } from '../../lib/EditContext'
import { elkLayout, narrowSpec, nodeSize, place, type Placement } from './layout'
import {
  DiagramEditContext,
  FRAME_ID,
  annotNodeId,
  buildEdges,
  buildNodes,
  edgeGeometry,
  edgeTypes,
  frameFor,
  groupNodeId,
  nodeTypes,
  sidePoint,
  type AnnotNodeData,
  type DiagramEditUi,
  type FrameNodeData,
} from './flow'
import {
  edgeKey,
  specHash,
  type Annotation,
  type Arrangement,
  type BakedDiagram,
  type Box,
  type DiagramSpec,
  type NodeKind,
  type Side,
  type SpecEdge,
} from './spec'

// Dev-only full-screen diagram editor. Lazy-loaded behind
// import.meta.env.DEV, so none of it reaches a production build.
//
// Direct manipulation first: everything is done on the diagram itself,
// and the toolbar that appears above a selection holds only what has no
// gesture (a box's kind and hover text, an arrow's dashing).
//
//   double-click canvas   new box, label ready to type
//   B / T / N, then click place a box, a text label, or a note
//   drag a box's dot      new arrow; drop on empty canvas for a new box
//   Tab                   new box connected after the selected one
//   double-click / Enter  edit a box, group, note or arrow label in place
//   drag an arrow's end   move it to another side, or another box
//   drag canvas           select; Shift-click adds; Space-drag or
//                         scroll pans, pinch or ⌘-scroll zooms
//   arrow keys            nudge (Shift = 10px); drag snaps to an 8px grid
//                         and to other nodes' edges and centers
//   Backspace             delete;  ⌘Z / ⇧⌘Z undo / redo;  ⌘S save
//
// The reader frame (what readers see) is always on the canvas. It fits
// the content until the author drags or resizes it; selecting it offers
// "Fit to content" to go back. Wide / Narrow hold two arrangements: the
// narrow one is what phones get when the wide one would shrink labels
// below the floor (see DiagramFigure). Untouched, narrow stays automatic.
//
// Structure edits (boxes, arrows, labels, kinds) save the whole spec into
// content/figures/<id>.json, which from then on wins over the spec in
// code (see spec.ts). Layout-only edits leave a code spec in charge.

type Props = {
  figureId: string
  spec: DiagramSpec
  baked: BakedDiagram | null
  placement: Placement
  // The spec lives in the JSON already (kind=diagram, or edited before).
  authored?: boolean
  // The figure code's spec, if any: recorded as `specFrom` when the
  // structure is first edited here.
  codeSpec?: DiagramSpec
  onClose: () => void
  // Called after a successful save (the "+" uses it to insert the block).
  onSaved?: () => void | Promise<void>
}

export default function DiagramArrange(props: Props) {
  return createPortal(
    <div className="mn-diagram-editor" role="dialog" aria-label={`Edit diagram ${props.figureId}`}>
      <ReactFlowProvider>
        <Arrange {...props} />
      </ReactFlowProvider>
    </div>,
    document.body,
  )
}

type Sides = NonNullable<BakedDiagram['edges']>
type Snapshot = { nodes: Node[]; sides: Sides; spec: DiagramSpec; frameAuto: boolean }
type Variant = 'wide' | 'narrow'
type Tool = 'select' | 'box' | 'text' | 'note'
type EndDrag = {
  key: string
  end: 'source' | 'target'
  // The fixed end's box, and the pointer in flow space.
  anchor: Box
  pt: [number, number]
  over: { id: string; side: Side } | null
}

const KINDS: { kind: NodeKind; name: string }[] = [
  { kind: 'process', name: 'Process' },
  { kind: 'accent', name: 'Highlight: the one the prose is about' },
  { kind: 'data', name: 'Data (dashed)' },
  { kind: 'store', name: 'Store (pill)' },
  { kind: 'external', name: 'External (dotted)' },
  { kind: 'decision', name: 'Decision (double border)' },
  { kind: 'note', name: 'Note' },
]
const SNAP = 6
// Small diagrams open at about reading size, not blown up to fill the screen.
const FIT_MAX = 1.25
const GAP = { RIGHT: 64, DOWN: 56 }

function Arrange({ figureId, spec: specProp, baked, placement, authored, codeSpec, onClose, onSaved }: Props) {
  const rf = useReactFlow()
  const [specState, setSpecState] = useState<DiagramSpec>(specProp)
  const specRef = useRef(specState)
  specRef.current = specState
  const setSpec = setSpecState
  const [variant, setVariant] = useState<Variant>('wide')
  // The narrow arrangement lays the spec out top to bottom.
  const spec = useMemo(() => (variant === 'narrow' ? narrowSpec(specState) : specState), [variant, specState])
  // Arrangements of the variant not on screen.
  const stash = useRef<Partial<Record<Variant, Arrangement>>>({})
  // Saved narrow arrangements stay; an automatic one is saved only once
  // the author changes something on the narrow tab.
  const [narrowTouched, setNarrowTouched] = useState(Boolean(baked?.narrow))
  const variantRef = useRef(variant)
  variantRef.current = variant
  const [sides, setSides] = useState<Sides>(() => ({ ...(baked?.edges ?? {}) }))
  const sidesRef = useRef(sides)
  sidesRef.current = sides
  const [frameAuto, setFrameAuto] = useState(!baked?.frame)
  const frameAutoRef = useRef(frameAuto)
  frameAutoRef.current = frameAuto
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editingEdge, setEditingEdge] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [endDrag, setEndDrag] = useState<EndDrag | null>(null)
  const [dragging, setDragging] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const undo = useRef<Snapshot[]>([])
  const redo = useRef<Snapshot[]>([])
  const dirty = useRef(false)
  const nodesRef = useRef<Node[]>([])
  const draggingRef = useRef(false)

  const flash = useCallback((msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice((m) => (m === msg ? '' : m)), 4000)
  }, [])

  const checkpoint = useCallback(() => {
    undo.current.push({
      nodes: nodesRef.current.map((n) => ({ ...n, data: { ...n.data } })),
      sides: { ...sidesRef.current },
      spec: specRef.current,
      frameAuto: frameAutoRef.current,
    })
    if (undo.current.length > 100) undo.current.shift()
    redo.current = []
    dirty.current = true
    if (variantRef.current === 'narrow') setNarrowTouched(true)
  }, [])

  const initial = useMemo(() => {
    const nodes = buildNodes(spec, placement, baked, { editable: true })
    nodes.push(frameNode(baked?.frame ?? frameFor(spec, placement, baked && { ...baked, frame: undefined }), !baked?.frame))
    return nodes
    // Built once per open; later changes live in editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initial)
  nodesRef.current = nodes

  const edges = useMemo(() => {
    const es = buildEdges(spec, baked, null, sides)
    return es.map((e) => (e.id === selectedEdge ? { ...e, selected: true } : e))
  }, [spec, baked, sides, selectedEdge])

  const unplaced = useMemo(() => Object.values(placement.nodes).filter((n) => n.unarranged).length, [placement])

  useEffect(() => {
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 0, maxZoom: FIT_MAX }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- geometry helpers ----------------------------------------------
  const absBox = useCallback(
    (id: string): Box | null => {
      const n = rf.getInternalNode(id)
      if (!n) return null
      const p = n.internals.positionAbsolute
      return { x: p.x, y: p.y, w: n.measured.width ?? n.width ?? 0, h: n.measured.height ?? n.height ?? 0 }
    },
    [rf],
  )

  // Current editor positions in the Placement shape (absolute boxes).
  const currentPlacement = (): Placement => {
    const out: Placement = { nodes: {}, groups: {} }
    for (const n of specRef.current.nodes) {
      const b = absBox(n.id)
      if (b) out.nodes[n.id] = { ...b, unarranged: false }
    }
    for (const g of specRef.current.groups ?? []) {
      const b = absBox(groupNodeId(g.id))
      if (b) out.groups[g.id] = b
    }
    return out
  }

  const currentAnnotations = (): Annotation[] => {
    const out: Annotation[] = []
    for (const n of nodesRef.current) {
      if (n.type !== 'annot') continue
      const b = absBox(n.id)
      const d = n.data as AnnotNodeData
      if (b) out.push({ id: n.id.slice(2), kind: d.kind, text: d.text, ...round(b) })
    }
    return out
  }

  // An automatic frame follows the content as it changes.
  useEffect(() => {
    if (!frameAuto) return
    const id = requestAnimationFrame(() => {
      const f = round(frameFor(spec, currentPlacement(), { figure: figureId, edges: sidesRef.current, annotations: currentAnnotations() }))
      setNodes((nds) => {
        const fr = nds.find((n) => n.id === FRAME_ID)
        if (fr && fr.position.x === f.x && fr.position.y === f.y && fr.width === f.w && fr.height === f.h) return nds
        return nds.map((n) => (n.id === FRAME_ID ? { ...n, position: { x: f.x, y: f.y }, width: f.w, height: f.h } : n))
      })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, frameAuto, sides, spec])

  // Alignment guides: while one node drags, snap its left/center/right
  // and top/middle/bottom to any other node's within SNAP px.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        // The author moved or resized the frame: it stops following the content.
        if ((c.type === 'position' && c.id === FRAME_ID && c.dragging) || (c.type === 'dimensions' && c.id === FRAME_ID && c.resizing)) {
          setFrameAuto(false)
        }
      }
      // Snap while a pointer drag is in progress, including its final
      // (dragging: false) change; never on arrow-key nudges.
      const moving = draggingRef.current ? changes.filter((c) => c.type === 'position' && c.position) : []
      const g: { x?: number; y?: number } = {}
      if (moving.length === 1 && (moving[0] as { id: string }).id !== FRAME_ID) {
        const c = moving[0] as Extract<NodeChange, { type: 'position' }>
        const node = nodesRef.current.find((n) => n.id === c.id)
        const me = absBox(c.id)
        if (node && me && c.position) {
          const parent = node.parentId ? absBox(node.parentId) : null
          const ax = c.position.x + (parent?.x ?? 0)
          const ay = c.position.y + (parent?.y ?? 0)
          const xs = [ax, ax + me.w / 2, ax + me.w]
          const ys = [ay, ay + me.h / 2, ay + me.h]
          let best = { dx: SNAP + 1, dy: SNAP + 1 }
          for (const o of nodesRef.current) {
            if (o.id === c.id || o.id === FRAME_ID || o.parentId === c.id) continue
            const b = absBox(o.id)
            if (!b) continue
            for (const ox of [b.x, b.x + b.w / 2, b.x + b.w]) {
              for (const x of xs) {
                const d = ox - x
                if (Math.abs(d) < Math.abs(best.dx)) {
                  best = { ...best, dx: d }
                  g.x = ox
                }
              }
            }
            for (const oy of [b.y, b.y + b.h / 2, b.y + b.h]) {
              for (const y of ys) {
                const d = oy - y
                if (Math.abs(d) < Math.abs(best.dy)) {
                  best = { ...best, dy: d }
                  g.y = oy
                }
              }
            }
          }
          if (Math.abs(best.dx) <= SNAP) c.position = { ...c.position, x: c.position.x + best.dx }
          else delete g.x
          if (Math.abs(best.dy) <= SNAP) c.position = { ...c.position, y: c.position.y + best.dy }
          else delete g.y
        }
      }
      setGuides(g)
      onNodesChangeBase(changes)
    },
    [absBox, onNodesChangeBase],
  )

  // ---- history -------------------------------------------------------
  const restore = (from: Snapshot[], to: Snapshot[]) => {
    const snap = from.pop()
    if (!snap) return
    to.push({ nodes: nodesRef.current, sides: sidesRef.current, spec: specRef.current, frameAuto: frameAutoRef.current })
    setNodes(snap.nodes)
    setSides(snap.sides)
    setSpec(snap.spec)
    setFrameAuto(snap.frameAuto)
    setEditing(null)
    setEditingEdge(null)
    setSelectedEdge((k) => (k && snap.spec.edges.some((e) => edgeKey(e) === k) ? k : null))
  }

  const clearSelection = () => {
    setSelectedEdge(null)
    setNodes((nds) => (nds.some((n) => n.selected) ? nds.map((n) => (n.selected ? { ...n, selected: false } : n)) : nds))
  }

  // ---- structure -----------------------------------------------------
  const freshId = (prefix: string, taken: (id: string) => boolean) => {
    let i = 1
    while (taken(`${prefix}${i}`)) i++
    return `${prefix}${i}`
  }

  // A new box centered on (x, y), optionally connected from another box;
  // its label opens for typing.
  const addBox = (x: number, y: number, from?: string) => {
    checkpoint()
    const id = freshId('n', (k) => specRef.current.nodes.some((n) => n.id === k))
    const label = 'Box'
    const { w, h } = nodeSize(label)
    setSpec((sp) => ({
      ...sp,
      nodes: [...sp.nodes, { id, label }],
      edges: from ? [...sp.edges, { from, to: id }] : sp.edges,
    }))
    setNodes((nds) => [
      ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
      {
        id,
        type: 'spec',
        position: { x: snap8(x - w / 2), y: snap8(y - h / 2) },
        width: w,
        height: h,
        selected: true,
        data: { label, kind: 'process', editable: true },
      },
    ])
    setSelectedEdge(null)
    setTool('select')
    setEditing(id)
  }

  // Tab: the next box in the flow direction, clear of everything else.
  const addAfter = (fromId: string) => {
    const b = absBox(fromId)
    if (!b) return
    const { w, h } = nodeSize('Box')
    const down = (spec.direction ?? 'RIGHT') === 'DOWN'
    const at: Box = down ? { x: b.x + b.w / 2 - w / 2, y: b.y + b.h + GAP.DOWN, w, h } : { x: b.x + b.w + GAP.RIGHT, y: b.y + b.h / 2 - h / 2, w, h }
    const others = nodesRef.current.filter((n) => n.type === 'spec' || n.type === 'annot').map((n) => absBox(n.id)).filter(Boolean) as Box[]
    for (let i = 0; i < 40 && others.some((o) => overlaps(at, o)); i++) {
      if (down) at.x += w + 24
      else at.y += h + 24
    }
    addBox(at.x + w / 2, at.y + h / 2, fromId)
  }

  const addAnnotation = (kind: Annotation['kind'], x: number, y: number) => {
    checkpoint()
    const id = freshId(`${kind}-`, (k) => nodesRef.current.some((n) => n.id === annotNodeId(k)))
    const [w, h] = kind === 'note' ? [180, 72] : [160, 32]
    setNodes((nds) => [
      ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
      {
        id: annotNodeId(id),
        type: 'annot',
        position: { x: snap8(x - w / 2), y: snap8(y - h / 2) },
        width: w,
        height: h,
        selected: true,
        data: { kind, text: kind === 'note' ? 'Note' : 'Label', editable: true },
      },
    ])
    setSelectedEdge(null)
    setTool('select')
    setEditing(annotNodeId(id))
  }

  const updateNode = (id: string, patch: { label?: string; kind?: NodeKind; detail?: string }) => {
    setSpec((sp) => ({
      ...sp,
      nodes: sp.nodes.map((n) => (n.id === id ? { ...n, ...patch, detail: (patch.detail ?? n.detail) || undefined } : n)),
    }))
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n
        const data = { ...n.data, ...patch }
        // Grow the box to fit a longer label; never shrink what the author sized.
        const fit = patch.label !== undefined ? nodeSize(patch.label) : null
        return fit
          ? { ...n, data, width: Math.max(Number(n.width ?? 0), fit.w), height: Math.max(Number(n.height ?? 0), fit.h) }
          : { ...n, data }
      }),
    )
  }

  const updateEdge = (key: string, patch: Partial<SpecEdge>) => {
    setSpec((sp) => ({
      ...sp,
      edges: sp.edges.map((e) => (edgeKey(e) === key ? { ...e, ...patch, label: (patch.label ?? e.label) || undefined } : e)),
    }))
  }

  // Swap an edge for a changed one (new end, or reversed). Its key can
  // change with it, so the sides it had move to the new key.
  const replaceEdge = (key: string, next: SpecEdge, nextSides: { source?: Side; target?: Side } | undefined) => {
    const nk = edgeKey(next)
    if (nk !== key && specRef.current.edges.some((e) => edgeKey(e) === nk)) {
      flash('Those boxes are already connected that way.')
      return false
    }
    checkpoint()
    setSpec((sp) => ({ ...sp, edges: sp.edges.map((e) => (edgeKey(e) === key ? next : e)) }))
    setSides((s) => {
      const n = { ...s }
      delete n[key]
      if (nextSides && (nextSides.source || nextSides.target)) n[nk] = nextSides
      return n
    })
    if (nk !== key) {
      for (const a of Object.values(stash.current)) {
        if (a?.edges?.[key]) {
          a.edges = { ...a.edges, [nk]: a.edges[key] }
          delete a.edges[key]
        }
      }
    }
    setSelectedEdge(nk)
    return true
  }

  const reverseEdge = (key: string) => {
    const e = specRef.current.edges.find((x) => edgeKey(x) === key)
    if (!e) return
    const s = sidesRef.current[key]
    replaceEdge(key, { ...e, from: e.to, to: e.from }, s && { source: s.target, target: s.source })
  }

  const setEdgeSides = (key: string, next: { source?: Side; target?: Side } | undefined) => {
    checkpoint()
    setSides((s) => {
      const n = { ...s }
      if (next && (next.source || next.target)) n[key] = next
      else delete n[key]
      return n
    })
  }

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    const key = `${c.source}--${c.target}`
    if (specRef.current.edges.some((e) => edgeKey(e) === key)) {
      flash('Those boxes are already connected that way.')
      return
    }
    checkpoint()
    setSpec((sp) => ({ ...sp, edges: [...sp.edges, { from: c.source, to: c.target }] }))
    clearSelection()
    setSelectedEdge(key)
  }

  // React Flow only connects when the drag ends on a handle. Ending on a
  // box connects to it; ending on empty canvas makes a new box there.
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    const hit = document.elementFromPoint(pt.clientX, pt.clientY)
    const to = hit?.closest('.react-flow__node')?.getAttribute('data-id')
    if (to && specRef.current.nodes.some((n) => n.id === to)) {
      onConnect({ source: state.fromNode.id, target: to, sourceHandle: null, targetHandle: null })
    } else if (hit?.closest('.react-flow__pane')) {
      const p = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
      addBox(p.x, p.y, state.fromNode.id)
    }
  }

  const onBeforeDelete: OnBeforeDelete = async ({ nodes: del, edges: delEdges }) => {
    // Groups and the frame stay: deleting a group would take its boxes too.
    const ok = del.filter((n) => n.type === 'annot' || n.type === 'spec')
    if (!ok.length && !delEdges.length) return false
    checkpoint()
    const gone = new Set(ok.filter((n) => n.type === 'spec').map((n) => n.id))
    const goneEdges = new Set(delEdges.map((e) => e.id))
    if (gone.size || goneEdges.size) {
      setSpec((sp) => ({
        ...sp,
        nodes: sp.nodes.filter((n) => !gone.has(n.id)),
        edges: sp.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to) && !goneEdges.has(edgeKey(e))),
      }))
    }
    if (selectedEdge && goneEdges.has(selectedEdge)) setSelectedEdge(null)
    return { nodes: ok, edges: delEdges }
  }

  // ---- in-place text -------------------------------------------------
  const commitText = (id: string, text: string | null) => {
    setEditing(null)
    if (text === null) return
    const node = nodesRef.current.find((n) => n.id === id)
    if (!node) return
    if (node.type === 'spec') {
      const cur = specRef.current.nodes.find((n) => n.id === id)
      if (!cur || !text.trim() || text === cur.label) return
      checkpoint()
      updateNode(id, { label: text })
    } else if (node.type === 'group') {
      const gid = id.slice(2)
      const cur = specRef.current.groups?.find((g) => g.id === gid)
      if (!cur || !text.trim() || text === cur.label) return
      checkpoint()
      setSpec((sp) => ({ ...sp, groups: sp.groups?.map((g) => (g.id === gid ? { ...g, label: text } : g)) }))
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: text } } : n)))
    } else if (node.type === 'annot') {
      if (text === (node.data as AnnotNodeData).text) return
      checkpoint()
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)))
    }
  }

  const commitEdgeLabel = (key: string, label: string | null) => {
    setEditingEdge(null)
    if (label === null) return
    const cur = specRef.current.edges.find((e) => edgeKey(e) === key)
    if (!cur || (cur.label ?? '') === label.trim()) return
    checkpoint()
    updateEdge(key, { label: label.trim() })
  }

  // ---- dragging an arrow's end ----------------------------------------
  const startEndDrag = (key: string, end: 'source' | 'target', e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const edge = specRef.current.edges.find((x) => edgeKey(x) === key)
    const anchor = edge && absBox(end === 'source' ? edge.to : edge.from)
    if (!edge || !anchor) return
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setEndDrag({ key, end, anchor, pt: [p.x, p.y], over: null })
  }

  useEffect(() => {
    if (!endDrag) return
    const overAt = (x: number, y: number): EndDrag['over'] => {
      let best: { id: string; side: Side; area: number } | null = null
      for (const n of specRef.current.nodes) {
        const b = absBox(n.id)
        if (!b || x < b.x - 14 || x > b.x + b.w + 14 || y < b.y - 14 || y > b.y + b.h + 14) continue
        const d: [Side, number][] = [
          ['left', Math.abs(x - b.x)],
          ['right', Math.abs(x - b.x - b.w)],
          ['top', Math.abs(y - b.y)],
          ['bottom', Math.abs(y - b.y - b.h)],
        ]
        const side = d.sort((a, c) => a[1] - c[1])[0][0]
        if (!best || b.w * b.h < best.area) best = { id: n.id, side, area: b.w * b.h }
      }
      return best && { id: best.id, side: best.side }
    }
    const move = (ev: PointerEvent) => {
      const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      setEndDrag((d) => d && { ...d, pt: [p.x, p.y], over: overAt(p.x, p.y) })
    }
    const up = () => {
      setEndDrag((d) => {
        if (d) queueMicrotask(() => dropEnd(d))
        return null
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // Re-subscribe only when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(endDrag)])

  const dropEnd = (d: EndDrag) => {
    if (!d.over) return
    const e = specRef.current.edges.find((x) => edgeKey(x) === d.key)
    if (!e) return
    const fixed = d.end === 'source' ? e.to : e.from
    if (d.over.id === fixed) {
      flash('An arrow needs two different boxes.')
      return
    }
    const next = d.end === 'source' ? { ...e, from: d.over.id } : { ...e, to: d.over.id }
    const s = { ...(sidesRef.current[d.key] ?? {}), [d.end]: d.over.side }
    if (next.from === e.from && next.to === e.to) setEdgeSides(d.key, s)
    else replaceEdge(d.key, next, s)
  }

  // ---- wide / narrow ---------------------------------------------------
  // The current editor state as an arrangement (what Save writes).
  const currentArrangement = (): Arrangement => {
    const p = currentPlacement()
    const annotations = currentAnnotations()
    const frame = !frameAutoRef.current ? absBox(FRAME_ID) : null
    return {
      nodes: Object.fromEntries(Object.entries(p.nodes).map(([k, b]) => [k, round(b)])),
      groups: Object.fromEntries(Object.entries(p.groups).map(([k, b]) => [k, round(b)])),
      ...(Object.keys(sidesRef.current).length ? { edges: sidesRef.current } : {}),
      ...(annotations.length ? { annotations } : {}),
      ...(frame ? { frame: round(frame) } : {}),
    }
  }

  const switchVariant = async (to: Variant) => {
    if (to === variant) return
    stash.current[variant] = currentArrangement()
    const saved = stash.current[to] ?? (to === 'narrow' ? baked?.narrow : baked) ?? null
    const s = to === 'narrow' ? narrowSpec(specRef.current) : specRef.current
    const asBaked: BakedDiagram = { figure: figureId, ...(saved ?? {}) }
    const p = await place(s, saved)
    const next = buildNodes(s, p, asBaked, { editable: true })
    next.push(frameNode(asBaked.frame ?? frameFor(s, p, { ...asBaked, frame: undefined }), !asBaked.frame))
    undo.current = []
    redo.current = []
    setNodes(next)
    setSides({ ...(saved?.edges ?? {}) })
    setFrameAuto(!asBaked.frame)
    setSelectedEdge(null)
    setEditing(null)
    setVariant(to)
    if (to === 'narrow' && !(saved && saved === baked?.narrow) && !stash.current.narrow) {
      flash('Automatic top-to-bottom layout. Arrange it and save to keep it.')
    }
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 0, maxZoom: FIT_MAX }))
  }

  // ---- arranging -----------------------------------------------------
  const setAbs = (id: string, x: number, y: number) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n
        const parent = n.parentId ? absBox(n.parentId) : null
        return { ...n, position: { x: Math.round(x - (parent?.x ?? 0)), y: Math.round(y - (parent?.y ?? 0)) } }
      }),
    )
  }

  type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hspread' | 'vspread'
  const align = (how: Align, ids: string[]) => {
    const boxes = ids.map((id) => [id, absBox(id)] as const).filter((x): x is readonly [string, Box] => Boolean(x[1]))
    if (boxes.length < 2) return
    checkpoint()
    const x0 = Math.min(...boxes.map(([, b]) => b.x))
    const x1 = Math.max(...boxes.map(([, b]) => b.x + b.w))
    const y0 = Math.min(...boxes.map(([, b]) => b.y))
    const y1 = Math.max(...boxes.map(([, b]) => b.y + b.h))
    if (how === 'hspread' || how === 'vspread') {
      const h = how === 'hspread'
      const sorted = [...boxes].sort(([, a], [, b]) => (h ? a.x - b.x : a.y - b.y))
      const total = sorted.reduce((s, [, b]) => s + (h ? b.w : b.h), 0)
      const gap = ((h ? x1 - x0 : y1 - y0) - total) / (sorted.length - 1)
      let at = h ? x0 : y0
      for (const [id, b] of sorted) {
        setAbs(id, h ? at : b.x, h ? b.y : at)
        at += (h ? b.w : b.h) + gap
      }
      return
    }
    for (const [id, b] of boxes) {
      const x = how === 'left' ? x0 : how === 'right' ? x1 - b.w : how === 'hcenter' ? (x0 + x1) / 2 - b.w / 2 : b.x
      const y = how === 'top' ? y0 : how === 'bottom' ? y1 - b.h : how === 'vcenter' ? (y0 + y1) / 2 - b.h / 2 : b.y
      setAbs(id, x, y)
    }
  }

  const applyPlacement = (p: Placement, only?: Set<string>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === 'group') {
          const b = p.groups[n.id.slice(2)]
          if (!b || only) return n
          return { ...n, position: { x: b.x, y: b.y }, width: b.w, height: b.h }
        }
        if (n.type !== 'spec' || (only && !only.has(n.id))) return n
        const b = p.nodes[n.id]
        if (!b) return n
        const parent = n.parentId ? (only ? absBox(n.parentId) : p.groups[n.parentId.slice(2)]) : null
        return {
          ...n,
          position: { x: b.x - (parent?.x ?? 0), y: b.y - (parent?.y ?? 0) },
          width: b.w,
          height: b.h,
          data: { ...n.data, unarranged: false },
        }
      }),
    )
  }

  // ELK layout: of the selection when 2+ boxes are selected, else of everything.
  const tidy = async (ids?: string[]) => {
    checkpoint()
    const selected = new Set(ids ?? [])
    if (selected.size >= 2) {
      const sub: DiagramSpec = {
        direction: spec.direction,
        nodes: spec.nodes.filter((n) => selected.has(n.id)).map((n) => ({ ...n, group: undefined })),
        edges: spec.edges.filter((e) => selected.has(e.from) && selected.has(e.to)),
      }
      const elk = await elkLayout(sub)
      const before = [...selected].map((id) => absBox(id)).filter(Boolean) as Box[]
      const ox = Math.min(...before.map((b) => b.x))
      const oy = Math.min(...before.map((b) => b.y))
      const nx = Math.min(...Object.values(elk.nodes).map((b) => b.x))
      const ny = Math.min(...Object.values(elk.nodes).map((b) => b.y))
      const p: Placement = { nodes: {}, groups: {} }
      for (const [id, b] of Object.entries(elk.nodes)) {
        p.nodes[id] = { ...b, x: b.x - nx + ox, y: b.y - ny + oy, unarranged: false }
      }
      applyPlacement(p, selected)
    } else {
      setSides({})
      applyPlacement(await place(spec, null))
      requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 200, maxZoom: FIT_MAX }))
    }
  }

  const fitFrame = () => {
    checkpoint()
    setFrameAuto(true)
  }

  // ---- save / close --------------------------------------------------
  const save = async () => {
    setBusy(true)
    try {
      const here = currentArrangement()
      const wide = variant === 'wide' ? here : (stash.current.wide ?? baked ?? {})
      const narrow = variant === 'narrow' ? here : (stash.current.narrow ?? baked?.narrow)
      // A code spec stays in charge unless the structure actually changed.
      const ownsSpec = authored || Boolean(baked?.spec) || specHash(specRef.current) !== specHash(specProp)
      const specFrom = baked?.specFrom ?? (!authored && codeSpec ? specHash(codeSpec) : undefined)
      const bake: BakedDiagram = {
        figure: figureId,
        ...pickArrangement(wide),
        ...(narrowTouched && narrow ? { narrow: pickArrangement(narrow) } : {}),
        ...(ownsSpec ? { spec: specRef.current, ...(specFrom ? { specFrom } : {}) } : {}),
      }
      await saveContentFile(`figures/${figureId}.json`, JSON.stringify(bake, null, 2))
      await onSaved?.()
      onClose()
    } catch (err) {
      flash(`Could not save: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    if (dirty.current && !window.confirm('Discard your changes to this diagram?')) return
    onClose()
  }

  // ---- keyboard ------------------------------------------------------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return
    const mod = e.metaKey || e.ctrlKey
    const sel = nodesRef.current.filter((n) => n.selected && n.id !== FRAME_ID)
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) restore(redo.current, undo.current)
      else restore(undo.current, redo.current)
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void save()
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelectedEdge(null)
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id !== FRAME_ID })))
    } else if (mod || e.altKey) {
      return
    } else if (e.key === 'Escape') {
      if (tool !== 'select') setTool('select')
      else clearSelection()
    } else if (e.key === 'Enter') {
      if (selectedEdge) {
        e.preventDefault()
        setEditingEdge(selectedEdge)
      } else if (sel.length === 1 && sel[0].type !== 'frame') {
        e.preventDefault()
        setEditing(sel[0].id)
      }
    } else if (e.key === 'Tab' && sel.length === 1 && sel[0].type === 'spec') {
      e.preventDefault()
      addAfter(sel[0].id)
    } else if (!e.shiftKey) {
      const k = e.key.toLowerCase()
      const pick: Record<string, Tool> = { v: 'select', b: 'box', r: 'box', t: 'text', n: 'note' }
      if (pick[k]) setTool(pick[k])
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- canvas gestures -----------------------------------------------
  const onPaneClick = (e: React.MouseEvent) => {
    if (tool === 'select') {
      setSelectedEdge(null)
      return
    }
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    if (tool === 'box') addBox(p.x, p.y)
    else addAnnotation(tool, p.x, p.y)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addBox(p.x, p.y)
  }

  // ---- what's selected -------------------------------------------------
  const selection = nodes.filter((n) => n.selected)
  const selNodes = selection.filter((n) => n.id !== FRAME_ID)
  const single = selection.length === 1 ? selection[0] : null
  const singleSpec = single?.type === 'spec' ? specState.nodes.find((n) => n.id === single.id) : undefined
  const selKey = selection.map((n) => n.id).join(',')
  useEffect(() => setDetailOpen(false), [selKey])

  const ui = useMemo<DiagramEditUi>(
    () => ({
      editing,
      commitText,
      selectedEdge,
      editingEdge,
      commitEdgeLabel,
      draggingEdge: endDrag?.key ?? null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, selectedEdge, editingEdge, endDrag?.key, specState, sides],
  )

  const edgeSpec = selectedEdge ? specState.edges.find((x) => edgeKey(x) === selectedEdge) : undefined
  const edgeToolbar = edgeSpec && selectedEdge && (
    <>
      <button type="button" onClick={() => setEditingEdge(selectedEdge)} title="Double-click the arrow, or Enter">
        {edgeSpec.label ? 'Edit label' : 'Add label'}
      </button>
      <button
        type="button"
        aria-pressed={Boolean(edgeSpec.dashed)}
        onClick={() => {
          checkpoint()
          updateEdge(selectedEdge, { dashed: !edgeSpec.dashed })
        }}
      >
        Dashed
      </button>
      <button type="button" onClick={() => reverseEdge(selectedEdge)} title="Point the arrow the other way">
        Reverse
      </button>
      {sides[selectedEdge] && (
        <button type="button" onClick={() => setEdgeSides(selectedEdge, undefined)} title="Let the arrow pick its own sides again">
          Auto sides
        </button>
      )}
      <Sep />
      <button type="button" className="is-danger" onClick={() => void rf.deleteElements({ edges: [{ id: selectedEdge }] })} title="Backspace">
        Delete
      </button>
    </>
  )

  let toolbar: ReactNode = null
  if (singleSpec && single) {
    toolbar = (
      <>
        <span className="mn-diagram-kinds" role="radiogroup" aria-label="Kind">
          {KINDS.map(({ kind, name }) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={(singleSpec.kind ?? 'process') === kind}
              title={name}
              aria-label={name}
              className="mn-diagram-kind"
              onClick={() => {
                checkpoint()
                updateNode(single.id, { kind })
              }}
            >
              <span className={`mn-flow-node mn-flow-node--${kind}`} />
            </button>
          ))}
        </span>
        <Sep />
        <button type="button" aria-pressed={detailOpen} onClick={() => setDetailOpen((o) => !o)} title="Shown to readers when they hover the box">
          {singleSpec.detail ? 'Hover text ✓' : 'Hover text'}
        </button>
        <Sep />
        <button type="button" className="is-danger" onClick={() => void rf.deleteElements({ nodes: [{ id: single.id }] })} title="Backspace">
          Delete
        </button>
        {detailOpen && (
          <textarea
            className="mn-diagram-detail nodrag"
            autoFocus
            rows={2}
            placeholder="What readers see when they hover this box"
            defaultValue={singleSpec.detail ?? ''}
            onFocus={checkpoint}
            onChange={(e) => updateNode(single.id, { detail: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault()
                setDetailOpen(false)
              }
            }}
          />
        )}
      </>
    )
  } else if (single?.type === 'annot') {
    const d = single.data as AnnotNodeData
    toolbar = (
      <>
        {(['text', 'note'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={d.kind === k}
            onClick={() => {
              if (d.kind === k) return
              checkpoint()
              setNodes((nds) => nds.map((n) => (n.id === single.id ? { ...n, data: { ...n.data, kind: k } } : n)))
            }}
          >
            {k === 'text' ? 'Text' : 'Note'}
          </button>
        ))}
        <Sep />
        <button type="button" className="is-danger" onClick={() => void rf.deleteElements({ nodes: [{ id: single.id }] })}>
          Delete
        </button>
      </>
    )
  } else if (single?.type === 'group') {
    toolbar = (
      <button type="button" onClick={() => setEditing(single.id)}>
        Rename group
      </button>
    )
  } else if (single?.type === 'frame') {
    toolbar = frameAuto ? (
      <span className="mn-diagram-toolbar-note">Fits the content. Drag or resize it to crop what readers see.</span>
    ) : (
      <button type="button" onClick={fitFrame}>
        Fit to content
      </button>
    )
  } else if (selNodes.length >= 2) {
    const ids = selNodes.map((n) => n.id)
    const specIds = selNodes.filter((n) => n.type === 'spec').map((n) => n.id)
    toolbar = (
      <>
        <IconButton label="Align left" onClick={() => align('left', ids)} d="M3 2v12M6 4h7v3H6zM6 9h4v3H6z" />
        <IconButton label="Align centers" onClick={() => align('hcenter', ids)} d="M8 2v12M4 4h8v3H4zM5.5 9h5v3h-5z" />
        <IconButton label="Align right" onClick={() => align('right', ids)} d="M13 2v12M3 4h7v3H3zM6 9h4v3H6z" />
        <Sep />
        <IconButton label="Align tops" onClick={() => align('top', ids)} d="M2 3h12M4 6v7h3V6zM9 6v4h3V6z" />
        <IconButton label="Align middles" onClick={() => align('vcenter', ids)} d="M2 8h12M4 4v8h3V4zM9 5.5v5h3v-5z" />
        <IconButton label="Align bottoms" onClick={() => align('bottom', ids)} d="M2 13h12M4 3v7h3V3zM9 6v4h3V6z" />
        {ids.length >= 3 && (
          <>
            <Sep />
            <IconButton label="Space evenly across" onClick={() => align('hspread', ids)} d="M2 2v12M14 2v12M6 5h4v6H6z" />
            <IconButton label="Space evenly down" onClick={() => align('vspread', ids)} d="M2 2h12M2 14h12M5 6h6v4H5z" />
          </>
        )}
        {specIds.length >= 2 && (
          <>
            <Sep />
            <button type="button" onClick={() => void tidy(specIds)} title="Lay out the selected boxes automatically">
              Tidy
            </button>
          </>
        )}
      </>
    )
  }
  const showToolbar = toolbar && !editing && !editingEdge && !endDrag && !dragging

  const hint = notice
    ? notice
    : endDrag
      ? 'Drop on the side of a box'
      : editing || editingEdge
        ? 'Enter to finish · Shift+Enter for a new line · Esc to cancel'
        : tool === 'box'
          ? 'Click to place a box · Esc to cancel'
          : tool === 'text' || tool === 'note'
            ? `Click to place a ${tool === 'text' ? 'text label' : 'note'} · Esc to cancel`
            : selectedEdge
              ? 'Drag either end to another side or box · double-click to label · Backspace deletes'
              : singleSpec
                ? 'Drag a dot to connect, or drop it on empty canvas for a new box · Tab adds the next box · Enter renames'
                : selNodes.length > 1
                  ? 'Drag to move together · arrow keys nudge (Shift = 10px)'
                  : unplaced && !dirty.current
                    ? `${unplaced} box${unplaced > 1 ? 'es are' : ' is'} new and placed automatically (dashed outline): drag into place`
                    : 'Double-click the canvas for a new box · drag a box’s dot to connect · drag the canvas to select · scroll or Space-drag to pan'

  return (
    <DiagramEditContext.Provider value={ui}>
      <div className="mn-diagram-editor-bar">
        <strong>{figureId}</strong>
        <span className="mn-diagram-variant" role="tablist" aria-label="Arrangement">
          {(['wide', 'narrow'] as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={variant === v}
              className={variant === v ? 'is-on' : undefined}
              title={v === 'wide' ? 'What readers see when it fits' : 'What phones get when the wide arrangement would shrink labels too far'}
              onClick={() => void switchVariant(v)}
            >
              {v === 'wide' ? 'Wide' : 'Narrow (phones)'}
            </button>
          ))}
        </span>
        <span style={{ flex: 1 }} />
        <IconButton label="Undo (⌘Z)" onClick={() => restore(undo.current, redo.current)} d="M5 4L2 7l3 3M2 7h8a4 4 0 010 8H8" />
        <IconButton label="Redo (⇧⌘Z)" onClick={() => restore(redo.current, undo.current)} d="M11 4l3 3-3 3M14 7H6a4 4 0 000 8h2" />
        <button type="button" onClick={cancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={() => void save()} disabled={busy} title="⌘S">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className={`mn-diagram-editor-canvas mn-diagram-arrange is-tool-${tool}`} onDoubleClick={onDoubleClick}>
        <ReactFlow
          nodes={nodes.map((n) => ({
            ...n,
            data: {
              ...n.data,
              onResizeStart:
                n.id === FRAME_ID
                  ? () => {
                      checkpoint()
                      setFrameAuto(false)
                    }
                  : checkpoint,
              ...(n.id === FRAME_ID ? { auto: frameAuto } : {}),
            },
          }))}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={() => {
            draggingRef.current = true
            setDragging(true)
            checkpoint()
          }}
          onNodeDragStop={() => {
            setDragging(false)
            // Let the drag's final position change (which follows this
            // callback in the same tick) still snap.
            setTimeout(() => {
              draggingRef.current = false
              setGuides({})
            }, 0)
          }}
          onNodeClick={() => setSelectedEdge(null)}
          onNodeDoubleClick={(_, n) => n.type !== 'frame' && setEditing(n.id)}
          onBeforeDelete={onBeforeDelete}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          connectionMode={ConnectionMode.Loose}
          onEdgeClick={(_, e) => {
            clearSelection()
            setSelectedEdge(e.id)
          }}
          onEdgeDoubleClick={(_, e) => {
            setSelectedEdge(e.id)
            setEditingEdge(e.id)
          }}
          onPaneClick={onPaneClick}
          onSelectionStart={() => setSelectedEdge(null)}
          snapToGrid
          snapGrid={[8, 8]}
          selectionOnDrag
          panOnDrag={[1, 2]}
          panOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          multiSelectionKeyCode="Shift"
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--border)" />
          <ViewportPortal>
            {guides.x !== undefined && <div className="mn-flow-guide mn-flow-guide--v" style={{ left: guides.x }} />}
            {guides.y !== undefined && <div className="mn-flow-guide mn-flow-guide--h" style={{ top: guides.y }} />}
            {endDrag && <EndDragPreview d={endDrag} target={endDrag.over ? absBox(endDrag.over.id) : null} />}
          </ViewportPortal>
          {showToolbar && (
            <NodeToolbar
              nodeId={selection.map((n) => n.id)}
              isVisible
              position={single?.type === 'frame' ? Position.Bottom : Position.Top}
              offset={14}
              className="mn-diagram-toolbar nodrag"
            >
              {toolbar}
            </NodeToolbar>
          )}
        </ReactFlow>
        {edgeSpec && selectedEdge && !editingEdge && !endDrag && (
          <EdgeOverlay
            geometry={() => {
              const a = absBox(edgeSpec.from)
              const b = absBox(edgeSpec.to)
              if (!a || !b) return null
              const others = specState.nodes
                .filter((n) => n.id !== edgeSpec.from && n.id !== edgeSpec.to)
                .map((n) => absBox(n.id))
                .filter(Boolean) as Box[]
              const g = edgeGeometry(a, b, { ...sides[selectedEdge], direction: spec.direction ?? 'RIGHT' }, others)
              return { ...g, top: Math.min(a.y, b.y, g.ly) }
            }}
            onEnd={(end, e) => startEndDrag(selectedEdge, end, e)}
          >
            {edgeToolbar}
          </EdgeOverlay>
        )}
        <div className="mn-diagram-tools" role="toolbar" aria-label="Tools">
          <ToolButton tool="select" cur={tool} set={setTool} label="Select (V)" d="M4 2l8 6-3.5.8L11 13l-1.8.8-2.4-4.3L4 12z" />
          <ToolButton tool="box" cur={tool} set={setTool} label="Box (B), or double-click the canvas" d="M2.5 4.5h11v7h-11z" />
          <ToolButton tool="text" cur={tool} set={setTool} label="Text label (T)" d="M3 3.5h10M8 3.5V13M6 13h4" />
          <ToolButton tool="note" cur={tool} set={setTool} label="Note (N)" d="M3 3h10v6.5L9.5 13H3zM9.5 13V9.5H13" />
          <Sep />
          <button type="button" className="mn-diagram-tools-text" onClick={() => void tidy()} title="Lay out the whole diagram automatically">
            Tidy all
          </button>
        </div>
        <p className="mn-diagram-hint" aria-live="polite">
          {hint}
        </p>
        <ZoomControls />
      </div>
    </DiagramEditContext.Provider>
  )
}

// The selected arrow's end handles and toolbar, in screen space above
// everything on the canvas (boxes' connect dots, the frame's dimming).
type EdgeGeom = { lx: number; top: number; p1: [number, number]; p2: [number, number] }
function EdgeOverlay({
  geometry,
  onEnd,
  children,
}: {
  geometry: () => EdgeGeom | null
  onEnd: (end: 'source' | 'target', e: ReactPointerEvent) => void
  children: ReactNode
}) {
  const { x, y, zoom } = useViewport()
  const g = geometry()
  if (!g) return null
  const at = ([px, py]: [number, number]) => ({ left: px * zoom + x, top: py * zoom + y })
  return (
    <div className="mn-diagram-overlay">
      {(['source', 'target'] as const).map((end) => (
        <div
          key={end}
          className="mn-flow-edge-end"
          title={end === 'source' ? 'Drag to move where the arrow starts' : 'Drag to move where the arrow points'}
          style={at(end === 'source' ? g.p1 : g.p2)}
          onPointerDown={(e) => onEnd(end, e)}
        />
      ))}
      <div className="mn-diagram-toolbar mn-diagram-toolbar--edge" style={at([g.lx, g.top])}>
        {children}
      </div>
    </div>
  )
}

// The arrow being re-attached: from its fixed box to the pointer, or to
// the side of the box it would drop on.
function EndDragPreview({ d, target }: { d: EndDrag; target: Box | null }) {
  const [tx, ty] = d.over && target ? sidePoint(target, d.over.side) : d.pt
  const a = d.anchor
  const [ax, ay] = edgeOf(a, tx, ty)
  const x0 = Math.min(ax, tx) - 20
  const y0 = Math.min(ay, ty) - 20
  return (
    <>
      {target && <div className="mn-flow-drop-box" style={{ left: target.x, top: target.y, width: target.w, height: target.h }} />}
      <svg className="mn-flow-end-preview" style={{ left: x0, top: y0, width: Math.abs(tx - ax) + 40, height: Math.abs(ty - ay) + 40 }}>
        <line x1={ax - x0} y1={ay - y0} x2={tx - x0} y2={ty - y0} />
        <circle cx={tx - x0} cy={ty - y0} r={5} />
      </svg>
    </>
  )
}

// Where the line from a box's center toward (tx, ty) leaves the box.
function edgeOf(b: Box, tx: number, ty: number): [number, number] {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = tx - cx
  const dy = ty - cy
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity, 1)
  return [cx + dx * s, cy + dy * s]
}

function ZoomControls() {
  const rf = useReactFlow()
  const { zoom } = useViewport()
  return (
    <div className="mn-diagram-zoom" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" onClick={() => void rf.zoomOut({ duration: 150 })}>
        −
      </button>
      <button type="button" title="Fit the diagram on screen" onClick={() => void rf.fitView({ padding: 0.2, duration: 200, maxZoom: FIT_MAX })}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => void rf.zoomIn({ duration: 150 })}>
        +
      </button>
    </div>
  )
}

function ToolButton({ tool, cur, set, label, d }: { tool: Tool; cur: Tool; set: (t: Tool) => void; label: string; d: string }) {
  return <IconButton label={label} pressed={tool === cur} onClick={() => set(tool)} d={d} />
}

function IconButton({ label, onClick, d, pressed }: { label: string; onClick: () => void; d: string; pressed?: boolean }) {
  return (
    <button type="button" className="mn-diagram-icon" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  )
}

function Sep() {
  return <span className="mn-diagram-sep" aria-hidden="true" />
}

function frameNode(b: Box, auto: boolean): Node<FrameNodeData> {
  return {
    id: FRAME_ID,
    type: 'frame',
    className: 'mn-frame-node',
    position: { x: b.x, y: b.y },
    width: b.w,
    height: b.h,
    zIndex: 2000,
    data: { auto },
  }
}

function pickArrangement(a: Arrangement): Arrangement {
  const { nodes, groups, edges, annotations, frame } = a
  return {
    ...(nodes && Object.keys(nodes).length ? { nodes } : {}),
    ...(groups && Object.keys(groups).length ? { groups } : {}),
    ...(edges && Object.keys(edges).length ? { edges } : {}),
    ...(annotations?.length ? { annotations } : {}),
    ...(frame ? { frame } : {}),
  }
}

function round(b: Box): Box {
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }
}

const snap8 = (v: number) => Math.round(v / 8) * 8

function overlaps(a: Box, b: Box, m = 16) {
  return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m
}
