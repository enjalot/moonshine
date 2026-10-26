import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  useReactFlow,
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
  FRAME_ID,
  annotNodeId,
  buildEdges,
  buildNodes,
  edgeTypes,
  frameFor,
  groupNodeId,
  nodeTypes,
  type AnnotNodeData,
} from './flow'
import {
  edgeKey,
  type Annotation,
  type Arrangement,
  type BakedDiagram,
  type Box,
  type DiagramSpec,
  type NodeKind,
  type Side,
} from './spec'

// Dev-only full-screen arrange editor for a DiagramFigure. Lazy-loaded
// behind import.meta.env.DEV, so none of it reaches a production build.
//
//   drag            move (snaps to an 8px grid and to other nodes' edges
//                   and centers; guides show what it snapped to)
//   shift-drag      box-select; shift-click adds to the selection
//   arrow keys      nudge the selection (shift = 10px steps)
//   corner handles  resize the selected node, group, note, or frame
//   click an edge   choose which side it leaves from / arrives at
//   double-click    edit a text or note annotation
//   ⌘Z / ⇧⌘Z        undo / redo
//   wide / narrow   two arrangements: the narrow one is what phones get
//                   when the wide one would shrink labels below the floor
//                   (see DiagramFigure). Untouched, narrow stays automatic.
//
// Spec nodes, groups and edges come from code and can't be deleted here;
// annotations can (Backspace). For an author-owned diagram (kind=diagram,
// `authored`), the spec is edited here too: + Box, drag from a side dot
// to another box to connect, select a box or arrow to edit its label and
// kind, Backspace deletes. Save writes content/figures/<id>.json.

type Props = {
  figureId: string
  spec: DiagramSpec
  baked: BakedDiagram | null
  placement: Placement
  authored?: boolean
  onClose: () => void
  // Called after a successful save (the "+" uses it to insert the block).
  onSaved?: () => void | Promise<void>
}

export default function DiagramArrange(props: Props) {
  return createPortal(
    <div className="mn-diagram-editor" role="dialog" aria-label={`Arrange diagram ${props.figureId}`}>
      <ReactFlowProvider>
        <Arrange {...props} />
      </ReactFlowProvider>
    </div>,
    document.body,
  )
}

type Snapshot = { nodes: Node[]; sides: NonNullable<BakedDiagram['edges']>; spec: DiagramSpec }
type Variant = 'wide' | 'narrow'
const KINDS: NodeKind[] = ['process', 'data', 'store', 'external', 'decision', 'accent', 'note']
const SNAP = 6
// Small diagrams open at about reading size, not blown up to fill the screen.
const FIT_MAX = 1.25
const SIDE_OPTIONS: (Side | '')[] = ['', 'top', 'right', 'bottom', 'left']

function Arrange({ figureId, spec: specProp, baked, placement, authored, onClose, onSaved }: Props) {
  const rf = useReactFlow()
  // The spec is fixed unless the author owns it (kind=diagram).
  const [specState, setSpecState] = useState<DiagramSpec>(specProp)
  const specRef = useRef(specState)
  specRef.current = specState
  const [variant, setVariant] = useState<Variant>('wide')
  // The narrow arrangement lays the spec out top to bottom.
  const spec = variant === 'narrow' ? narrowSpec(specState) : specState
  // Arrangements of the variant not on screen, plus whether narrow was
  // ever opened (an unopened narrow stays automatic: nothing is saved).
  const stash = useRef<Partial<Record<Variant, Arrangement>>>({})
  // Saved narrow arrangements stay; an automatic one is saved only once
  // the author changes something on the narrow tab.
  const [narrowTouched, setNarrowTouched] = useState(Boolean(baked?.narrow))
  const variantRef = useRef(variant)
  variantRef.current = variant
  const [sides, setSides] = useState<NonNullable<BakedDiagram['edges']>>(() => ({ ...(baked?.edges ?? {}) }))
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const undo = useRef<Snapshot[]>([])
  const redo = useRef<Snapshot[]>([])
  const nodesRef = useRef<Node[]>([])
  const draggingRef = useRef(false)
  const sidesRef = useRef(sides)
  sidesRef.current = sides

  const checkpoint = useCallback(() => {
    undo.current.push({
      nodes: nodesRef.current.map((n) => ({ ...n, data: { ...n.data } })),
      sides: { ...sidesRef.current },
      spec: specRef.current,
    })
    if (undo.current.length > 100) undo.current.shift()
    redo.current = []
    if (variantRef.current === 'narrow') setNarrowTouched(true)
  }, [])

  const onText = useCallback<NonNullable<AnnotNodeData['onText']>>((id, text) => {
    checkpoint()
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpoint])

  const initial = useMemo(() => {
    const nodes = buildNodes(spec, placement, baked, { editable: true, connectable: authored, onText })
    if (baked?.frame) nodes.unshift(frameNode(baked.frame))
    return nodes
    // Built once per open; later changes live in editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initial)
  nodesRef.current = nodes

  const edges = useMemo(() => {
    const es = buildEdges(spec, baked, null, sides)
    return es.map((e) => (e.id === selectedEdge ? { ...e, selected: true, data: { ...e.data!, active: true } } : e))
  }, [spec, baked, sides, selectedEdge])

  useEffect(() => {
    const unplaced = Object.values(placement.nodes).filter((n) => n.unarranged).length
    setStatus(
      unplaced
        ? `${unplaced} node${unplaced > 1 ? 's' : ''} new in the spec, placed automatically (dashed): drag into place`
        : authored
          ? 'drag a side dot to another box to connect · select a box or arrow to edit it'
          : 'drag to arrange · shift-drag to select · double-click a note to edit',
    )
    requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 0, maxZoom: FIT_MAX }))
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

  // Alignment guides: while one node drags, snap its left/center/right
  // and top/middle/bottom to any other node's within SNAP px.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Snap while a pointer drag is in progress, including its final
      // (dragging: false) change; never on arrow-key nudges.
      const moving = draggingRef.current ? changes.filter((c) => c.type === 'position' && c.position) : []
      const g: { x?: number; y?: number } = {}
      if (moving.length === 1) {
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
    to.push({ nodes: nodesRef.current, sides: sidesRef.current, spec: specRef.current })
    setNodes(snap.nodes)
    setSides(snap.sides)
    setSpecState(snap.spec)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) restore(redo.current, undo.current)
        else restore(undo.current, redo.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onBeforeDelete: OnBeforeDelete = async ({ nodes: del, edges: delEdges }) => {
    const ok = del.filter((n) => n.type === 'annot' || n.id === FRAME_ID || (authored && n.type === 'spec'))
    const okEdges = authored ? delEdges : []
    if (!ok.length && !okEdges.length) return false
    checkpoint()
    if (authored) {
      const gone = new Set(ok.filter((n) => n.type === 'spec').map((n) => n.id))
      const goneEdges = new Set(okEdges.map((e) => e.id))
      setSpecState((sp) => ({
        ...sp,
        nodes: sp.nodes.filter((n) => !gone.has(n.id)),
        edges: sp.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to) && !goneEdges.has(edgeKey(e))),
      }))
      if (selectedEdge && goneEdges.has(selectedEdge)) setSelectedEdge(null)
    }
    return { nodes: ok, edges: okEdges }
  }

  // ---- authoring (kind=diagram) --------------------------------------
  const addBox = () => {
    checkpoint()
    const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    let i = 1
    while (specRef.current.nodes.some((n) => n.id === `n${i}`)) i++
    const id = `n${i}`
    const label = 'Box'
    const { w, h } = nodeSize(label)
    setSpecState((sp) => ({ ...sp, nodes: [...sp.nodes, { id, label }] }))
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id,
        type: 'spec',
        position: { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) },
        width: w,
        height: h,
        selected: true,
        data: { label, kind: 'process', editable: true, connectable: true },
      },
    ])
  }

  const updateNode = (id: string, patch: { label?: string; kind?: NodeKind; detail?: string }) => {
    setSpecState((sp) => ({
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

  const updateEdge = (key: string, patch: { label?: string; dashed?: boolean }) => {
    setSpecState((sp) => ({
      ...sp,
      edges: sp.edges.map((e) => (edgeKey(e) === key ? { ...e, ...patch, label: (patch.label ?? e.label) || undefined } : e)),
    }))
  }

  // React Flow only connects when the drag ends on a handle; ending
  // anywhere on a box should work too.
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (!authored || state.isValid || !state.fromNode) return
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node')
    const to = el?.getAttribute('data-id')
    if (to && specRef.current.nodes.some((n) => n.id === to)) {
      onConnect({ source: state.fromNode.id, target: to, sourceHandle: null, targetHandle: null })
    }
  }

  const onConnect = (c: Connection) => {
    if (!authored || !c.source || !c.target || c.source === c.target) return
    const key = `${c.source}--${c.target}`
    if (specRef.current.edges.some((e) => edgeKey(e) === key)) return
    checkpoint()
    setSpecState((sp) => ({ ...sp, edges: [...sp.edges, { from: c.source, to: c.target }] }))
    setSelectedEdge(key)
  }

  // ---- wide / narrow ---------------------------------------------------
  // The current editor state as an arrangement (what Save writes).
  const currentArrangement = (): Arrangement => {
    const p = currentPlacement()
    const annotations: Annotation[] = []
    for (const n of nodesRef.current) {
      if (n.type !== 'annot') continue
      const b = absBox(n.id)
      const d = n.data as AnnotNodeData
      if (b) annotations.push({ id: n.id.slice(2), kind: d.kind, text: d.text, ...round(b) })
    }
    const frame = nodesRef.current.some((n) => n.id === FRAME_ID) ? absBox(FRAME_ID) : null
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
    const next = buildNodes(s, p, asBaked, { editable: true, connectable: authored, onText })
    if (asBaked.frame) next.unshift(frameNode(asBaked.frame))
    undo.current = []
    redo.current = []
    setNodes(next)
    setSides({ ...(saved?.edges ?? {}) })
    setSelectedEdge(null)
    setVariant(to)
    setStatus(
      to === 'narrow'
        ? saved === baked?.narrow && saved
          ? 'narrow arrangement: shown on screens too small for the wide one'
          : 'narrow arrangement (automatic, top to bottom): arrange it and Save to keep it'
        : 'wide arrangement',
    )
    requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 0, maxZoom: FIT_MAX }))
  }

  // ---- actions -------------------------------------------------------
  const addAnnotation = (kind: Annotation['kind']) => {
    checkpoint()
    const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    let i = 1
    while (nodesRef.current.some((n) => n.id === annotNodeId(`${kind}-${i}`))) i++
    const id = `${kind}-${i}`
    const [w, h] = kind === 'note' ? [180, 72] : [160, 32]
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id: annotNodeId(id),
        type: 'annot',
        position: { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) },
        width: w,
        height: h,
        selected: true,
        data: { kind, text: kind === 'note' ? 'Note' : 'Label', editable: true, onText },
      },
    ])
  }

  const toggleFrame = () => {
    checkpoint()
    if (nodesRef.current.some((n) => n.id === FRAME_ID)) {
      setNodes((nds) => nds.filter((n) => n.id !== FRAME_ID))
      setStatus('reader frame removed: readers see the bounds of everything')
      return
    }
    setNodes((nds) => [frameNode(frameFor(spec, currentPlacement(), null)), ...nds])
    setStatus('drag and resize the frame to crop what readers see')
  }

  // Current editor positions in the Placement shape (absolute boxes).
  const currentPlacement = (): Placement => {
    const out: Placement = { nodes: {}, groups: {} }
    for (const n of specRef.current.nodes) {
      const b = absBox(n.id)
      if (b) out.nodes[n.id] = { ...b, unarranged: false }
    }
    for (const g of spec.groups ?? []) {
      const b = absBox(groupNodeId(g.id))
      if (b) out.groups[g.id] = b
    }
    return out
  }

  const applyPlacement = (p: Placement, only?: Set<string>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === 'group') {
          const gid = n.id.slice(2)
          const b = p.groups[gid]
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

  const autoLayout = async () => {
    checkpoint()
    const selected = new Set(nodesRef.current.filter((n) => n.selected && n.type === 'spec').map((n) => n.id))
    if (selected.size >= 2) {
      // Lay out just the selection, keeping it where it was.
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
      setStatus(`laid out ${selected.size} selected nodes`)
    } else {
      applyPlacement(await place(spec, null))
      setStatus('laid out the whole diagram from the spec (annotations kept)')
      requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 200, maxZoom: FIT_MAX }))
    }
  }

  const setSide = (key: string, end: 'source' | 'target', side: Side | '') => {
    checkpoint()
    setSides((s) => {
      const cur = { ...(s[key] ?? {}) }
      if (side) cur[end] = side
      else delete cur[end]
      const next = { ...s }
      if (cur.source || cur.target) next[key] = cur
      else delete next[key]
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      const here = currentArrangement()
      const wide = variant === 'wide' ? here : (stash.current.wide ?? baked ?? {})
      const narrow = variant === 'narrow' ? here : (stash.current.narrow ?? baked?.narrow)
      const bake: BakedDiagram = {
        figure: figureId,
        ...pickArrangement(wide),
        ...(narrowTouched && narrow ? { narrow: pickArrangement(narrow) } : {}),
        ...(authored ? { spec: specRef.current } : {}),
      }
      await saveContentFile(`figures/${figureId}.json`, JSON.stringify(bake, null, 2))
      await onSaved?.()
      onClose()
    } catch (err) {
      setStatus(`could not save: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const edgeSpec = selectedEdge ? spec.edges.find((e) => edgeKey(e) === selectedEdge) : null
  const selectedSpecNodes = nodes.filter((n) => n.selected && n.type === 'spec')
  const nodeSpec = authored && selectedSpecNodes.length === 1 ? spec.nodes.find((n) => n.id === selectedSpecNodes[0].id) : null

  return (
    <>
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
              title={v === 'wide' ? 'The arrangement readers see when it fits' : 'Shown on screens too narrow for the wide arrangement'}
              onClick={() => void switchVariant(v)}
            >
              {v}
            </button>
          ))}
        </span>
        <span className="mn-diagram-editor-status">{status}</span>
        <span style={{ flex: 1 }} />
        {authored && (
          <button type="button" onClick={addBox} title="Add a box">
            + Box
          </button>
        )}
        <button type="button" onClick={() => addAnnotation('text')} title="Add a text label">
          + Text
        </button>
        <button type="button" onClick={() => addAnnotation('note')} title="Add a sticky note">
          + Note
        </button>
        <button type="button" onClick={() => void autoLayout()} title="ELK layout: the selection if 2+ nodes are selected, else everything">
          Auto-layout
        </button>
        <button type="button" onClick={toggleFrame} title="Crop what readers see">
          Frame
        </button>
        <button type="button" onClick={() => restore(undo.current, redo.current)} title="Undo (⌘Z)">
          ↶
        </button>
        <button type="button" onClick={() => restore(redo.current, undo.current)} title="Redo (⇧⌘Z)">
          ↷
        </button>
        <button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className={`mn-diagram-editor-canvas mn-diagram-arrange${authored ? ' is-authoring' : ''}`}>
        <ReactFlow
          nodes={nodes.map((n) =>
            ({ ...n, data: { ...n.data, onResizeStart: checkpoint } }),
          )}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={() => {
            draggingRef.current = true
            checkpoint()
          }}
          onNodeDragStop={() => {
            // Let the drag's final position change (which follows this
            // callback in the same tick) still snap.
            setTimeout(() => {
              draggingRef.current = false
              setGuides({})
            }, 0)
          }}
          onBeforeDelete={onBeforeDelete}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          connectionMode={ConnectionMode.Loose}
          onEdgeClick={(_, e) => setSelectedEdge(e.id)}
          onPaneClick={() => setSelectedEdge(null)}
          snapToGrid
          snapGrid={[8, 8]}
          selectionOnDrag={false}
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          panOnScroll
          zoomOnPinch
          nodesConnectable={Boolean(authored)}
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--border)" />
          <ViewportPortal>
            {guides.x !== undefined && <div className="mn-flow-guide mn-flow-guide--v" style={{ left: guides.x }} />}
            {guides.y !== undefined && <div className="mn-flow-guide mn-flow-guide--h" style={{ top: guides.y }} />}
          </ViewportPortal>
        </ReactFlow>
        {edgeSpec && selectedEdge && (
          <div className="mn-diagram-edge-panel">
            <code>{selectedEdge}</code>
            {authored && (
              <>
                <label>
                  label{' '}
                  <input
                    value={edgeSpec.label ?? ''}
                    onFocus={checkpoint}
                    onChange={(e) => updateEdge(selectedEdge, { label: e.target.value })}
                    size={12}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(edgeSpec.dashed)}
                    onChange={(e) => {
                      checkpoint()
                      updateEdge(selectedEdge, { dashed: e.target.checked })
                    }}
                  />{' '}
                  dashed
                </label>
              </>
            )}
            <label>
              leaves from{' '}
              <select value={sides[selectedEdge]?.source ?? ''} onChange={(e) => setSide(selectedEdge, 'source', e.target.value as Side | '')}>
                {SIDE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o || 'auto'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              arrives at{' '}
              <select value={sides[selectedEdge]?.target ?? ''} onChange={(e) => setSide(selectedEdge, 'target', e.target.value as Side | '')}>
                {SIDE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o || 'auto'}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setSelectedEdge(null)}>
              ×
            </button>
          </div>
        )}
        {nodeSpec && !edgeSpec && (
          <div className="mn-diagram-edge-panel">
            <code>{nodeSpec.id}</code>
            <label>
              label{' '}
              <input
                value={nodeSpec.label}
                onFocus={checkpoint}
                onChange={(e) => updateNode(nodeSpec.id, { label: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
                size={16}
              />
            </label>
            <label>
              kind{' '}
              <select
                value={nodeSpec.kind ?? 'process'}
                onChange={(e) => {
                  checkpoint()
                  updateNode(nodeSpec.id, { kind: e.target.value as NodeKind })
                }}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label title="Shown to readers on hover">
              detail{' '}
              <input
                value={nodeSpec.detail ?? ''}
                onFocus={checkpoint}
                onChange={(e) => updateNode(nodeSpec.id, { detail: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
                size={18}
              />
            </label>
          </div>
        )}
      </div>
    </>
  )
}

function frameNode(b: Box): Node {
  return {
    id: FRAME_ID,
    type: 'frame',
    position: { x: b.x, y: b.y },
    width: b.w,
    height: b.h,
    zIndex: -2,
    data: {},
  }
}

function pickArrangement(a: Arrangement): Arrangement {
  const { nodes, groups, edges, annotations, frame } = a
  return {
    ...(nodes && Object.keys(nodes).length ? { nodes } : {}),
    ...(groups && Object.keys(groups).length ? { groups } : {}),
    ...(edges ? { edges } : {}),
    ...(annotations ? { annotations } : {}),
    ...(frame ? { frame } : {}),
  }
}

function round(b: Box): Box {
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }
}
