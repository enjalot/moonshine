import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { inOrder, lessThan, param, scale, translate, type Draggable, type DragSpec, type DragSpecBuilder, type DragStatus } from 'dragology'
import { saveContentFile } from '../../lib/EditContext'
import DragRenderer from '../drag/Renderer'
import { each } from '../drag/each'
import { drawAnnot, drawEdge, drawGroup, drawNode, edgeLabelWidth, flags, ids, type DrawCtx } from './draw'
import {
  DEFAULT_PAD,
  borderPoint,
  contentBounds,
  groupBox,
  groupBoxes,
  inside,
  padBetween,
  padBox,
  routeEdges,
  sidePoint,
  union,
  type EdgeGeom,
} from './geometry'
import { elkLayout, narrowSpec, nodeSize, place, type Placement } from './layout'
import { glyph, glyphNames } from './glyphs'
import { isTile, TILE, tileLabelBox } from './tile'
import { useFontEpoch } from './text'
import {
  edgeKey,
  specHash,
  type Annotation,
  type Arrangement,
  type BakedDiagram,
  type Box,
  type DiagramSpec,
  type EdgeArrangement,
  type NodeKind,
  type Pad,
  type Side,
  type SpecEdge,
  type SpecNode,
} from './spec'

// Dev-only full-screen diagram editor. Lazy-loaded behind
// import.meta.env.DEV, so none of it reaches a production build.
//
// The canvas is drawn by Dragology (declarative dragging, see drag/), the
// same way readers see the diagram. Every gesture is said as "dragging
// this can lead to these diagrams", and Dragology renders those diagrams
// to work out the motion:
//
//   drag a box            its x/y vary; it snaps to an 8px grid and to
//                         other boxes' edges and centers; dropped inside
//                         a group's box, it joins the group (the group
//                         grows to take it in as you drag); out, it leaves
//   drag a box's dot      a new arrow. Over a box it shows the finished
//                         arrow; dropped on empty canvas it makes a new
//                         box there; let go anywhere else, it snaps back
//   drag an arrow's end   the arrow re-routes live to the nearest side of
//                         any box (the end floats under the pointer);
//                         far from every side, the end follows the
//                         pointer, and dropping there changes nothing
//   drag an arrow's label slide it along the arrow
//   drag a corner handle  resize a box, note or group
//   drag the frame        set that side's margin (negative crops)
//   undo, redo, Tidy, align, Wide/Narrow
//                         animate from the old diagram to the new one
//
//   double-click canvas   new box, label ready to type
//   B / T / N, then click place a box, a text label, or a note
//   Tab                   new box connected after the selected one
//   double-click / Enter  edit a box, group, note or arrow label in place
//   drag canvas           select; Shift-click adds; Space-drag or
//                         scroll pans, pinch or ⌘-scroll zooms
//   arrow keys            nudge (Shift = 10px)
//   Backspace             delete;  ⌘Z / ⇧⌘Z undo / redo;  ⌘S save
//
// The reader frame (what readers see) is always on the canvas: the
// content's bounds (arrows and labels included) plus a margin per side,
// so it follows the diagram. Wide / Narrow hold two arrangements: the
// narrow one is what phones get when the wide one would shrink labels
// below the floor (see DiagramFigure). Untouched, narrow stays automatic.
//
// Structure edits (boxes, arrows, labels, kinds, group membership) save
// the whole spec into content/figures/<id>.json, which from then on wins
// over the spec in code (see spec.ts). Layout-only edits leave a code spec
// in charge.

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
  // The figure's width (column or wide) and the drawing width each gives,
  // so the frame can say what readers will see; setWide saves a change.
  layout?: { wide: boolean; widths: { column: number; wide: number }; setWide?: (on: boolean) => Promise<void> }
  onClose: () => void
  // Called after a successful save (the "+" uses it to insert the block).
  onSaved?: (opts: { wide: boolean }) => void | Promise<void>
}

export default function DiagramArrange(props: Props) {
  return createPortal(
    <div className="mn-diagram-editor" role="dialog" aria-label={`Edit diagram ${props.figureId}`}>
      <Arrange {...props} />
    </div>,
    document.body,
  )
}

// ---- the document ---------------------------------------------------------

// What the canvas draws, and what undo steps through. `reattach` and
// `draft` exist only mid-drag: an arrow end being moved, and a new arrow
// being drawn out of a box. Neither is ever saved.
type Doc = {
  spec: DiagramSpec
  nodes: Record<string, Box>
  // Group boxes as the author sized them; drawn grown to hold their boxes.
  groups: Record<string, Box>
  sides: Record<string, EdgeArrangement>
  annots: Annotation[]
  pad: Pad
  reattach?: { edge: number; end: 'source' | 'target'; free?: { x: number; y: number } }
  draft?: { from: string; side: Side; to?: string; free: { x: number; y: number } }
}

type Variant = 'wide' | 'narrow'
type Tool = 'select' | 'box' | 'text' | 'note'
// A selected thing: a spec node, group or annotation, or the reader frame.
type Item = { kind: 'node' | 'group' | 'annot'; id: string } | { kind: 'frame'; id: 'frame' }
type View = { x: number; y: number; k: number }
type Editing = { kind: 'node' | 'group' | 'annot' | 'edge'; id: string } | null

// Colour families for links and glyphs (tokens.css); null is plain.
const TONES: (string | null)[] = [null, 'flow', 'data', 'control', 'access']
const ARROWS: { v: NonNullable<SpecEdge['arrows']>; glyph: string; name: string }[] = [
  { v: 'end', glyph: '→', name: 'One way' },
  { v: 'both', glyph: '↔', name: 'Both ways' },
  { v: 'none', glyph: '—', name: 'No direction' },
]
const KINDS: { kind: NodeKind; name: string }[] = [
  { kind: 'process', name: 'Process' },
  { kind: 'accent', name: 'Highlight: the one the prose is about' },
  { kind: 'data', name: 'Data (dashed)' },
  { kind: 'store', name: 'Store (pill)' },
  { kind: 'external', name: 'External (dotted)' },
  { kind: 'decision', name: 'Decision (double border)' },
  { kind: 'note', name: 'Note' },
]
// Alignment snap distance and the arrow-end snap radius, in screen px.
const SNAP = 6
const END_SNAP = 30
// Small diagrams open at about reading size, not blown up to fill the screen.
const FIT_MAX = 1.25
const GAP = { RIGHT: 64, DOWN: 56 }
const MIN = { node: { w: 40, h: 32 }, annot: { w: 40, h: 24 }, group: { w: 80, h: 60 } }

function toDoc(spec: DiagramSpec, placement: Placement, baked: Pick<BakedDiagram, 'edges' | 'annotations' | 'framePad' | 'frame'> | null): Doc {
  const nodes: Record<string, Box> = {}
  for (const [id, b] of Object.entries(placement.nodes)) nodes[id] = { x: b.x, y: b.y, w: b.w, h: b.h }
  return {
    spec,
    nodes,
    groups: { ...placement.groups },
    sides: { ...(baked?.edges ?? {}) },
    annots: baked?.annotations ?? [],
    pad: padFrom(spec, placement, baked),
  }
}

// Group boxes as drawn: saved, grown to hold their boxes.
const drawnGroups = (doc: Doc) => groupBoxes(doc.spec, doc.nodes, doc.groups)

function boundsOf(doc: Doc): Box {
  return contentBounds(doc.spec, { nodes: doc.nodes, groups: drawnGroups(doc) }, { edges: doc.sides, annotations: doc.annots })
}

const frameOf = (doc: Doc) => padBox(boundsOf(doc), doc.pad)

// The doc as an arrangement (what Save writes).
function arrangementOf(doc: Doc): Arrangement {
  const r = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })
  const keys = new Set(doc.spec.edges.map(edgeKey))
  const edges = Object.fromEntries(
    Object.entries(doc.sides)
      .filter(([k, v]) => keys.has(k) && (v.source || v.target || v.labelAt !== undefined))
      .map(([k, v]) => [k, v.labelAt === undefined ? v : { ...v, labelAt: Math.round(v.labelAt * 100) / 100 }]),
  )
  return {
    nodes: Object.fromEntries(Object.entries(doc.nodes).map(([k, b]) => [k, r(b)])),
    groups: Object.fromEntries(Object.entries(drawnGroups(doc)).map(([k, b]) => [k, r(b)])),
    ...(Object.keys(edges).length ? { edges } : {}),
    ...(doc.annots.length ? { annotations: doc.annots.map((a) => ({ ...a, ...r(a) })) } : {}),
    ...(samePad(doc.pad, DEFAULT_PAD) ? {} : { framePad: doc.pad }),
  }
}

// ---- structure helpers (pure) ------------------------------------------

function freshId(prefix: string, taken: (id: string) => boolean) {
  let i = 1
  while (taken(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

const snap8 = (v: number) => Math.round(v / 8) * 8

function withEdge(doc: Doc, i: number, next: SpecEdge, sides: EdgeArrangement | undefined): Doc {
  const old = edgeKey(doc.spec.edges[i])
  const nk = edgeKey(next)
  const s = { ...doc.sides }
  delete s[old]
  if (sides && (sides.source || sides.target || sides.labelAt !== undefined)) s[nk] = sides
  return { ...doc, spec: { ...doc.spec, edges: doc.spec.edges.map((e, j) => (j === i ? next : e)) }, sides: s }
}

// Would this edge duplicate another one (same ends, same direction)?
const clashes = (doc: Doc, i: number, next: SpecEdge) => doc.spec.edges.some((e, j) => j !== i && edgeKey(e) === edgeKey(next))

function addBoxDoc(doc: Doc, cx: number, cy: number, from?: string): { doc: Doc; id: string } {
  const id = freshId('n', (k) => doc.spec.nodes.some((n) => n.id === k))
  // In a diagram of tiles a new node is a tile too, with the glyph of the
  // node it was pulled out of (or the first one in use).
  const like = doc.spec.nodes.find((n) => n.id === from && n.icon) ?? doc.spec.nodes.find((n) => n.icon)
  const label = like ? 'Name' : 'Box'
  const { w, h } = like ? { w: TILE, h: TILE } : nodeSize(label)
  const node: SpecNode = like ? { id, label, icon: like.icon, tone: like.tone, labelSide: like.labelSide } : { id, label }
  return {
    id,
    doc: {
      ...doc,
      spec: {
        ...doc.spec,
        nodes: [...doc.spec.nodes, node],
        edges: from ? [...doc.spec.edges, { from, to: id }] : doc.spec.edges,
      },
      nodes: { ...doc.nodes, [id]: { x: snap8(cx - w / 2), y: snap8(cy - h / 2), w, h } },
    },
  }
}

// A dragged box joins the group whose box (as drawn without it) holds its
// center, and leaves its group once its center is outside.
function regroup(doc: Doc, id: string): Doc {
  const b = doc.nodes[id]
  const n = doc.spec.nodes.find((x) => x.id === id)
  if (!b || !n || !doc.spec.groups?.length) return doc
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const holds = (gid: string) => {
    const g = groupBox(doc.spec, gid, doc.nodes, doc.groups[gid], id)
    return Boolean(g && inside(g, cx, cy))
  }
  const next = n.group && holds(n.group) ? n.group : doc.spec.groups.find((g) => holds(g.id))?.id
  if (next === n.group) return doc
  return { ...doc, spec: { ...doc.spec, nodes: doc.spec.nodes.map((x) => (x.id === id ? { ...x, group: next } : x)) } }
}

function shift(doc: Doc, items: Item[], dx: number, dy: number): Doc {
  const nodes = { ...doc.nodes }
  const groups = { ...doc.groups }
  const moved = new Set<string>()
  const move = (id: string) => {
    if (moved.has(id) || !nodes[id]) return
    moved.add(id)
    nodes[id] = { ...nodes[id], x: nodes[id].x + dx, y: nodes[id].y + dy }
  }
  for (const it of items) {
    if (it.kind === 'node') move(it.id)
    if (it.kind === 'group') {
      if (groups[it.id]) groups[it.id] = { ...groups[it.id], x: groups[it.id].x + dx, y: groups[it.id].y + dy }
      for (const n of doc.spec.nodes) if (n.group === it.id) move(n.id)
    }
  }
  const annots = doc.annots.map((a) => (items.some((it) => it.kind === 'annot' && it.id === a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a))
  return { ...doc, nodes, groups, annots }
}

// ---- the editor -------------------------------------------------------------

function Arrange({ figureId, spec: specProp, baked, placement, authored, codeSpec, layout, onClose, onSaved }: Props) {
  const uid = `dge${useId().replace(/:/g, '')}`
  const c: DrawCtx = { uid }
  const [variant, setVariant] = useState<Variant>('wide')
  const [doc, setDocState] = useState<Doc>(() => toDoc(specProp, placement, baked))
  const docRef = useRef(doc)
  docRef.current = doc
  // The narrow arrangement lays the spec out top to bottom.
  const dir = (doc.spec.direction ?? 'RIGHT') as 'RIGHT' | 'DOWN'
  // The other variant's doc, while it's not on screen.
  const stash = useRef<Partial<Record<Variant, Doc>>>({})
  // Saved narrow arrangements stay; an automatic one is saved only once
  // the author changes something on the narrow tab.
  const [narrowTouched, setNarrowTouched] = useState(Boolean(baked?.narrow))
  const [unarranged, setUnarranged] = useState(() => new Set(Object.entries(placement.nodes).filter(([, b]) => b.unarranged).map(([id]) => id)))

  const [sel, setSel] = useState<Item[]>([])
  const [selEdge, setSelEdge] = useState<number | null>(null)
  const [hoverNode, setHoverNode] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [figWide, setFigWide] = useState(Boolean(layout?.wide))
  const undo = useRef<Doc[]>([])
  const redo = useRef<Doc[]>([])
  const dirty = useRef(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const spaceRef = useRef(false)
  // What the drag in progress started on, for selecting it on drop.
  const grabbed = useRef<Item | null>(null)

  const flash = useCallback((msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice((m) => (m === msg ? '' : m)), 4000)
  }, [])

  // Every change to the diagram goes through here: one undo step, and the
  // canvas animates to the new doc.
  const commit = useCallback((next: Doc) => {
    const cur = docRef.current
    if (next === cur) return
    undo.current.push(cur)
    if (undo.current.length > 100) undo.current.shift()
    redo.current = []
    dirty.current = true
    if (variantRef.current === 'narrow') setNarrowTouched(true)
    docRef.current = next
    setDocState(next)
  }, [])
  const variantRef = useRef(variant)
  variantRef.current = variant

  const restore = (from: Doc[], to: Doc[]) => {
    const prev = from.pop()
    if (!prev) return
    to.push(docRef.current)
    docRef.current = prev
    setDocState(prev)
    setEditing(null)
    setSelEdge((i) => (i !== null && i < prev.spec.edges.length ? i : null))
    setSel((s) => s.filter((it) => it.kind === 'frame' || (it.kind === 'annot' ? prev.annots.some((a) => a.id === it.id) : it.kind === 'group' ? prev.spec.groups?.some((g) => g.id === it.id) : prev.nodes[it.id])))
  }

  // ---- view ------------------------------------------------------------
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitView = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const W = el.clientWidth
    const H = el.clientHeight
    const b = union(boundsOf(docRef.current), frameOf(docRef.current))
    const k = Math.max(0.2, Math.min(FIT_MAX, (W * 0.8) / b.w, (H * 0.75) / b.h))
    setView({ k, x: W / 2 - (b.x + b.w / 2) * k, y: H / 2 - (b.y + b.h / 2) * k })
  }, [])
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && size.w) {
      fitted.current = true
      fitView()
    }
  }, [size.w, fitView])

  // Screen (canvas-relative) ↔ diagram coordinates.
  const toDiagram = (clientX: number, clientY: number) => {
    const r = canvasRef.current?.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - (r?.left ?? 0) - v.x) / v.k, y: (clientY - (r?.top ?? 0) - v.y) / v.k }
  }
  const toScreen = (x: number, y: number) => ({ left: x * view.k + view.x, top: y * view.k + view.y })

  const zoomAt = (k: number, sx: number, sy: number) => {
    setView((v) => {
      const nk = Math.max(0.2, Math.min(3, k))
      return { k: nk, x: sx - ((sx - v.x) / v.k) * nk, y: sy - ((sy - v.y) / v.k) * nk }
    })
  }

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.('.mn-diagram-toolbar, textarea')) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(viewRef.current.k * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---- selection --------------------------------------------------------
  const isSel = (kind: Item['kind'], id: string) => sel.some((s) => s.kind === kind && s.id === id)
  const select = (it: Item, add: boolean) => {
    setSelEdge(null)
    setSel((s) => (add ? (s.some((x) => x.kind === it.kind && x.id === it.id) ? s.filter((x) => !(x.kind === it.kind && x.id === it.id)) : [...s, it]) : [it]))
  }
  const clearSelection = () => {
    setSel([])
    setSelEdge(null)
  }

  // ---- structure edits ----------------------------------------------------
  const addBox = (cx: number, cy: number, from?: string) => {
    const r = addBoxDoc(docRef.current, cx, cy, from)
    commit(r.doc)
    setSel([{ kind: 'node', id: r.id }])
    setSelEdge(null)
    setTool('select')
    setEditing({ kind: 'node', id: r.id })
  }

  // Tab: the next box in the flow direction, clear of everything else.
  const addAfter = (fromId: string) => {
    const b = docRef.current.nodes[fromId]
    if (!b) return
    const { w, h } = nodeSize('Box')
    const down = dir === 'DOWN'
    const at: Box = down ? { x: b.x + b.w / 2 - w / 2, y: b.y + b.h + GAP.DOWN, w, h } : { x: b.x + b.w + GAP.RIGHT, y: b.y + b.h / 2 - h / 2, w, h }
    const others = [...Object.values(docRef.current.nodes), ...docRef.current.annots]
    for (let i = 0; i < 40 && others.some((o) => overlaps(at, o)); i++) {
      if (down) at.x += w + 24
      else at.y += h + 24
    }
    addBox(at.x + w / 2, at.y + h / 2, fromId)
  }

  const addAnnotation = (kind: Annotation['kind'], x: number, y: number) => {
    const d0 = docRef.current
    const id = freshId(`${kind}-`, (k) => d0.annots.some((a) => a.id === k))
    const [w, h] = kind === 'note' ? [180, 72] : [160, 32]
    commit({ ...d0, annots: [...d0.annots, { id, kind, text: kind === 'note' ? 'Note' : 'Label', x: snap8(x - w / 2), y: snap8(y - h / 2), w, h }] })
    setSel([{ kind: 'annot', id }])
    setSelEdge(null)
    setTool('select')
    setEditing({ kind: 'annot', id })
  }

  const updateNode = (id: string, patch: Partial<Pick<SpecNode, 'label' | 'kind' | 'detail' | 'icon' | 'labelSide' | 'tone' | 'dashed'>>) => {
    const d0 = docRef.current
    const before = d0.spec.nodes.find((n) => n.id === id)
    const nodes = d0.spec.nodes.map((n) => {
      if (n.id !== id) return n
      const next: SpecNode = { ...n, ...patch, detail: (patch.detail ?? n.detail) || undefined }
      // Unset fields leave the saved spec.
      for (const k of ['icon', 'labelSide', 'tone', 'dashed'] as const) if (!next[k]) delete next[k]
      return next
    })
    const after = nodes.find((n) => n.id === id)
    const b = d0.nodes[id]
    // Box ↔ tile: the node becomes a tile (or a box sized to its label)
    // around the same centre.
    if (b && before && after && isTile(before) !== isTile(after)) {
      const size = isTile(after) ? { w: TILE, h: TILE } : nodeSize(after.label)
      return {
        ...d0,
        spec: { ...d0.spec, nodes },
        nodes: { ...d0.nodes, [id]: { x: snap8(b.x + b.w / 2 - size.w / 2), y: snap8(b.y + b.h / 2 - size.h / 2), ...size } },
      }
    }
    // Grow the box to fit a longer label; never shrink what the author
    // sized. A tile's label is outside it, so the tile keeps its size.
    const fit = patch.label !== undefined && after && !isTile(after) ? nodeSize(patch.label) : null
    return {
      ...d0,
      spec: { ...d0.spec, nodes },
      nodes: fit && b ? { ...d0.nodes, [id]: { ...b, w: Math.max(b.w, fit.w), h: Math.max(b.h, fit.h) } } : d0.nodes,
    }
  }

  const updateEdge = (i: number, patch: Partial<SpecEdge>) => {
    const d0 = docRef.current
    commit({ ...d0, spec: { ...d0.spec, edges: d0.spec.edges.map((e, j) => (j === i ? { ...e, ...patch, label: (patch.label ?? e.label) || undefined } : e)) } })
  }

  const reverseEdge = (i: number) => {
    const d0 = docRef.current
    const e = d0.spec.edges[i]
    const next = { ...e, from: e.to, to: e.from }
    if (clashes(d0, i, next)) return flash('Those boxes are already connected that way.')
    const s = d0.sides[edgeKey(e)]
    commit(withEdge(d0, i, next, s && { source: s.target, target: s.source, labelAt: s.labelAt === undefined ? undefined : 1 - s.labelAt }))
  }

  const autoSides = (i: number) => {
    const d0 = docRef.current
    const k = edgeKey(d0.spec.edges[i])
    const s = { ...d0.sides }
    if (s[k]?.labelAt !== undefined) s[k] = { labelAt: s[k].labelAt }
    else delete s[k]
    commit({ ...d0, sides: s })
  }

  const deleteSelection = () => {
    const d0 = docRef.current
    if (selEdge !== null) {
      const e = d0.spec.edges[selEdge]
      if (!e) return
      const sides = { ...d0.sides }
      delete sides[edgeKey(e)]
      commit({ ...d0, spec: { ...d0.spec, edges: d0.spec.edges.filter((_, j) => j !== selEdge) }, sides })
      setSelEdge(null)
      return
    }
    // Groups and the frame stay: deleting a group would take its boxes too.
    const gone = new Set(sel.filter((s) => s.kind === 'node').map((s) => s.id))
    const goneA = new Set(sel.filter((s) => s.kind === 'annot').map((s) => s.id))
    if (!gone.size && !goneA.size) return
    const nodes = { ...d0.nodes }
    for (const id of gone) delete nodes[id]
    commit({
      ...d0,
      spec: { ...d0.spec, nodes: d0.spec.nodes.filter((n) => !gone.has(n.id)), edges: d0.spec.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)) },
      nodes,
      annots: d0.annots.filter((a) => !goneA.has(a.id)),
    })
    setSel([])
  }

  type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hspread' | 'vspread'
  const align = (how: Align) => {
    const d0 = docRef.current
    const items = sel.filter((s) => s.kind === 'node' || s.kind === 'annot')
    const boxOf = (it: Item): Box | undefined => (it.kind === 'node' ? d0.nodes[it.id] : d0.annots.find((a) => a.id === it.id))
    const boxes = items.map((it) => [it, boxOf(it)] as const).filter((x): x is readonly [Item, Box] => Boolean(x[1]))
    if (boxes.length < 2) return
    const x0 = Math.min(...boxes.map(([, b]) => b.x))
    const x1 = Math.max(...boxes.map(([, b]) => b.x + b.w))
    const y0 = Math.min(...boxes.map(([, b]) => b.y))
    const y1 = Math.max(...boxes.map(([, b]) => b.y + b.h))
    const at = new Map<string, { x: number; y: number }>()
    if (how === 'hspread' || how === 'vspread') {
      const h = how === 'hspread'
      const sorted = [...boxes].sort(([, a], [, b]) => (h ? a.x - b.x : a.y - b.y))
      const total = sorted.reduce((s, [, b]) => s + (h ? b.w : b.h), 0)
      const gap = ((h ? x1 - x0 : y1 - y0) - total) / (sorted.length - 1)
      let p = h ? x0 : y0
      for (const [it, b] of sorted) {
        at.set(`${it.kind}:${it.id}`, { x: h ? p : b.x, y: h ? b.y : p })
        p += (h ? b.w : b.h) + gap
      }
    } else {
      for (const [it, b] of boxes) {
        const x = how === 'left' ? x0 : how === 'right' ? x1 - b.w : how === 'hcenter' ? (x0 + x1) / 2 - b.w / 2 : b.x
        const y = how === 'top' ? y0 : how === 'bottom' ? y1 - b.h : how === 'vcenter' ? (y0 + y1) / 2 - b.h / 2 : b.y
        at.set(`${it.kind}:${it.id}`, { x, y })
      }
    }
    const nodes = { ...d0.nodes }
    for (const [k, p] of at) if (k.startsWith('node:')) nodes[k.slice(5)] = { ...nodes[k.slice(5)], x: Math.round(p.x), y: Math.round(p.y) }
    const annots = d0.annots.map((a) => {
      const p = at.get(`annot:${a.id}`)
      return p ? { ...a, x: Math.round(p.x), y: Math.round(p.y) } : a
    })
    commit({ ...d0, nodes, annots })
  }

  // ELK layout: of the selection when 2+ boxes are selected, else of everything.
  const tidy = async (only?: string[]) => {
    const d0 = docRef.current
    const picked = new Set(only ?? [])
    if (picked.size >= 2) {
      const sub: DiagramSpec = {
        direction: d0.spec.direction,
        nodes: d0.spec.nodes.filter((n) => picked.has(n.id)).map((n) => ({ ...n, group: undefined })),
        edges: d0.spec.edges.filter((e) => picked.has(e.from) && picked.has(e.to)),
      }
      const elk = await elkLayout(sub)
      const before = [...picked].map((id) => d0.nodes[id]).filter(Boolean)
      const ox = Math.min(...before.map((b) => b.x))
      const oy = Math.min(...before.map((b) => b.y))
      const nx = Math.min(...Object.values(elk.nodes).map((b) => b.x))
      const ny = Math.min(...Object.values(elk.nodes).map((b) => b.y))
      const nodes = { ...d0.nodes }
      for (const [id, b] of Object.entries(elk.nodes)) nodes[id] = { ...b, x: b.x - nx + ox, y: b.y - ny + oy }
      commit({ ...docRef.current, nodes })
    } else {
      const p = await place(d0.spec, null)
      commit({ ...docRef.current, ...toDoc(d0.spec, p, { annotations: d0.annots, framePad: d0.pad }), sides: {} })
      setUnarranged(new Set())
      requestAnimationFrame(fitView)
    }
  }

  // ---- in-place text ------------------------------------------------------
  const commitText = (ed: NonNullable<Editing>, text: string | null) => {
    setEditing(null)
    if (text === null) return
    const d0 = docRef.current
    if (ed.kind === 'node') {
      const cur = d0.spec.nodes.find((n) => n.id === ed.id)
      if (!cur || !text.trim() || text === cur.label) return
      commit(updateNode(ed.id, { label: text }))
    } else if (ed.kind === 'group') {
      const cur = d0.spec.groups?.find((g) => g.id === ed.id)
      if (!cur || !text.trim() || text === cur.label) return
      commit({ ...d0, spec: { ...d0.spec, groups: d0.spec.groups?.map((g) => (g.id === ed.id ? { ...g, label: text } : g)) } })
    } else if (ed.kind === 'annot') {
      const cur = d0.annots.find((a) => a.id === ed.id)
      if (!cur || text === cur.text) return
      commit({ ...d0, annots: d0.annots.map((a) => (a.id === ed.id ? { ...a, text } : a)) })
    } else {
      const i = Number(ed.id)
      const cur = d0.spec.edges[i]
      if (!cur || (cur.label ?? '') === text.trim()) return
      updateEdge(i, { label: text.trim() })
    }
  }

  // ---- wide / narrow ----------------------------------------------------
  const switchVariant = async (to: Variant) => {
    if (to === variant) return
    const here = docRef.current
    stash.current[variant] = here
    let next = stash.current[to]
    if (next) {
      // The structure is shared: carry spec edits across.
      next = { ...next, spec: to === 'narrow' ? narrowSpec(here.spec) : { ...here.spec, direction: specProp.direction } }
      const missing = next.spec.nodes.filter((n) => !next!.nodes[n.id])
      if (missing.length) {
        const p = await place(next.spec, { nodes: next.nodes, groups: next.groups })
        next = { ...next, nodes: Object.fromEntries(Object.entries(p.nodes).map(([k, b]) => [k, { x: b.x, y: b.y, w: b.w, h: b.h }])) }
      }
    } else {
      const saved = to === 'narrow' ? baked?.narrow : baked
      const s = to === 'narrow' ? narrowSpec(here.spec) : here.spec
      const p = await place(s, saved ?? null)
      next = toDoc(s, p, saved ?? null)
      if (to === 'narrow' && !saved) flash('Automatic top-to-bottom layout. Arrange it and save to keep it.')
    }
    undo.current = []
    redo.current = []
    docRef.current = next
    setDocState(next)
    clearSelection()
    setEditing(null)
    setVariant(to)
    requestAnimationFrame(fitView)
  }

  // ---- save / close ------------------------------------------------------
  const save = async () => {
    setBusy(true)
    try {
      const here = docRef.current
      const wideDoc = variant === 'wide' ? here : stash.current.wide
      const narrowDoc = variant === 'narrow' ? here : stash.current.narrow
      const wide = wideDoc ? arrangementOf(wideDoc) : pickArrangement(baked ?? {})
      const narrow = narrowDoc ? arrangementOf(narrowDoc) : baked?.narrow
      // The spec is shared; the narrow tab shows it turned a quarter.
      const spec = variant === 'wide' ? here.spec : { ...here.spec, direction: specProp.direction }
      // A code spec stays in charge unless the structure actually changed.
      const ownsSpec = authored || Boolean(baked?.spec) || specHash(spec) !== specHash(specProp)
      const specFrom = baked?.specFrom ?? (!authored && codeSpec ? specHash(codeSpec) : undefined)
      const bake: BakedDiagram = {
        figure: figureId,
        ...pickArrangement(wide),
        ...(narrowTouched && narrow ? { narrow: pickArrangement(narrow) } : {}),
        ...(ownsSpec ? { spec, ...(specFrom ? { specFrom } : {}) } : {}),
      }
      await saveContentFile(`figures/${figureId}.json`, JSON.stringify(bake, null, 2))
      if (layout?.setWide && figWide !== layout.wide) await layout.setWide(figWide)
      await onSaved?.({ wide: figWide })
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

  // ---- keyboard -----------------------------------------------------------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return
    const mod = e.metaKey || e.ctrlKey
    const items = sel.filter((s) => s.kind !== 'frame')
    if (e.key === ' ') {
      spaceRef.current = true
      return
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) restore(redo.current, undo.current)
      else restore(undo.current, redo.current)
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void save()
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelEdge(null)
      setSel([...doc.spec.nodes.map((n) => ({ kind: 'node' as const, id: n.id })), ...doc.annots.map((a) => ({ kind: 'annot' as const, id: a.id }))])
    } else if (mod || e.altKey) {
      return
    } else if (e.key === 'Escape') {
      if (tool !== 'select') setTool('select')
      else clearSelection()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      deleteSelection()
    } else if (e.key === 'Enter') {
      if (selEdge !== null) {
        e.preventDefault()
        setEditing({ kind: 'edge', id: String(selEdge) })
      } else if (items.length === 1) {
        e.preventDefault()
        setEditing(items[0] as NonNullable<Editing>)
      }
    } else if (e.key === 'Tab' && items.length === 1 && items[0].kind === 'node') {
      e.preventDefault()
      addAfter(items[0].id)
    } else if (e.key.startsWith('Arrow') && items.length) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      commit(shift(docRef.current, items, dx, dy))
    } else if (!e.shiftKey) {
      const k = e.key.toLowerCase()
      const pick: Record<string, Tool> = { v: 'select', b: 'box', r: 'box', t: 'text', n: 'note' }
      if (pick[k]) setTool(pick[k])
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // ---- canvas gestures (the background: select, pan, place) -------------
  const onBackgroundDown = (e: React.PointerEvent) => {
    const panning = spaceRef.current || e.button === 1 || e.button === 2
    if (panning) {
      e.preventDefault()
      const start = { cx: e.clientX, cy: e.clientY, ...viewRef.current }
      const move = (ev: PointerEvent) => setView((v) => ({ ...v, x: start.x + ev.clientX - start.cx, y: start.y + ev.clientY - start.cy }))
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      return
    }
    if (e.button !== 0 || tool !== 'select') return
    const r = canvasRef.current?.getBoundingClientRect()
    if (!r) return
    const x0 = e.clientX - r.left
    const y0 = e.clientY - r.top
    const add = e.shiftKey
    let moved = false
    const move = (ev: PointerEvent) => {
      const x1 = ev.clientX - r.left
      const y1 = ev.clientY - r.top
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return
      moved = true
      setMarquee({ x0, y0, x1, y1 })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setMarquee(null)
      if (!moved) {
        if (!add) clearSelection()
        return
      }
      const v = viewRef.current
      const a = { x: (Math.min(x0, ev.clientX - r.left) - v.x) / v.k, y: (Math.min(y0, ev.clientY - r.top) - v.y) / v.k }
      const b = { x: (Math.max(x0, ev.clientX - r.left) - v.x) / v.k, y: (Math.max(y0, ev.clientY - r.top) - v.y) / v.k }
      const hit = (o: Box) => o.x < b.x && o.x + o.w > a.x && o.y < b.y && o.y + o.h > a.y
      const d0 = docRef.current
      const got: Item[] = [
        ...Object.entries(d0.nodes).filter(([, o]) => hit(o)).map(([id]) => ({ kind: 'node' as const, id })),
        ...d0.annots.filter(hit).map((o) => ({ kind: 'annot' as const, id: o.id })),
      ]
      setSelEdge(null)
      setSel((s) => (add ? [...s, ...got.filter((g) => !s.some((x) => x.kind === g.kind && x.id === g.id))] : got))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onBackgroundClick = (e: React.MouseEvent) => {
    if (tool === 'select') return
    const p = toDiagram(e.clientX, e.clientY)
    if (tool === 'box') addBox(p.x, p.y)
    else addAnnotation(tool, p.x, p.y)
  }

  // ---- drag specs -----------------------------------------------------------
  // Each says what dragging a thing can lead to; Dragology does the rest.

  // Snap a moved box to other boxes' edges and centers (else the 8px
  // grid), then let it join or leave a group.
  const settle = (s: Doc, id: string): Doc => {
    const b = s.nodes[id]
    if (!b) return s
    const tol = SNAP / viewRef.current.k
    const fit = (mine: number[], theirs: number[]) => {
      let best = tol + 1
      for (const t of theirs) for (const m of mine) if (Math.abs(t - m) < Math.abs(best)) best = t - m
      return Math.abs(best) <= tol ? best : null
    }
    const others = Object.entries(s.nodes).filter(([k]) => k !== id).map(([, o]) => o)
    const dx = fit([b.x, b.x + b.w / 2, b.x + b.w], others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w]))
    const dy = fit([b.y, b.y + b.h / 2, b.y + b.h], others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h]))
    const x = dx === null ? snap8(b.x) : b.x + dx
    const y = dy === null ? snap8(b.y) : b.y + dy
    return regroup({ ...s, nodes: { ...s.nodes, [id]: { ...b, x, y } } }, id)
  }

  const moveSpec = (d: DragSpecBuilder<Doc>, s: Doc, it: Item): DragSpec<Doc> => {
    grabbed.current = it
    const many = isSel(it.kind, it.id) && sel.filter((x) => x.kind !== 'frame').length > 1
    if (many) return d.varyFunc([0, 0], ([dx, dy]) => shift(s, sel, dx, dy))
    if (it.kind === 'node') return d.vary(s, [param('nodes', it.id, 'x'), param('nodes', it.id, 'y')]).during((p) => settle(p, it.id))
    if (it.kind === 'annot') {
      const i = s.annots.findIndex((a) => a.id === it.id)
      return d.vary(s, [param('annots', i, 'x'), param('annots', i, 'y')]).during((p) => ({ ...p, annots: p.annots.map((a, j) => (j === i ? { ...a, x: snap8(a.x), y: snap8(a.y) } : a)) }))
    }
    // A group moves with its boxes; its saved box goes along.
    const g = drawnGroups(s)[it.id]
    const base = g ? { ...s, groups: { ...s.groups, [it.id]: g } } : s
    return d.varyFunc([0, 0], ([dx, dy]) => shift(base, [it], dx, dy))
  }

  const resizeSpec = (d: DragSpecBuilder<Doc>, s: Doc, it: Item): DragSpec<Doc> => {
    if (it.kind === 'node') {
      return d.vary(s, [param('nodes', it.id, 'w'), param('nodes', it.id, 'h')], {
        constraint: (p) => [lessThan(MIN.node.w, p.nodes[it.id].w), lessThan(MIN.node.h, p.nodes[it.id].h)],
      })
    }
    if (it.kind === 'annot') {
      const i = s.annots.findIndex((a) => a.id === it.id)
      return d.vary(s, [param('annots', i, 'w'), param('annots', i, 'h')], {
        constraint: (p) => [lessThan(MIN.annot.w, p.annots[i].w), lessThan(MIN.annot.h, p.annots[i].h)],
      })
    }
    const g = drawnGroups(s)[it.id]
    const base = g ? { ...s, groups: { ...s.groups, [it.id]: g } } : s
    // Never smaller than its boxes need (the drawn box grows to hold them).
    return d.vary(base, [param('groups', it.id, 'w'), param('groups', it.id, 'h')], {
      constraint: (p) => [lessThan(MIN.group.w, p.groups[it.id].w), lessThan(MIN.group.h, p.groups[it.id].h)],
    })
  }

  // The frame's sides: dragging one sets that side's margin.
  const frameSpec = (d: DragSpecBuilder<Doc>, s: Doc, sides: (keyof Pad)[]): DragSpec<Doc> =>
    d.vary(s, sides.map((k) => param('pad', k))).during((p) => ({ ...p, pad: roundPad(p.pad) }))

  // An arrow's end: the arrow re-routes to whichever side of whichever box
  // is nearest, while the end handle floats under the pointer. Far from
  // every side, the end just follows the pointer, and dropping there
  // leaves the arrow as it was.
  const endSpec = (d: DragSpecBuilder<Doc>, s: Doc, i: number, end: 'source' | 'target'): DragSpec<Doc> => {
    const e = s.spec.edges[i]
    const fixed = end === 'source' ? e.to : e.from
    const key = edgeKey(e)
    const base: Doc = { ...s, reattach: { edge: i, end } }
    const targets: Doc[] = []
    for (const n of s.spec.nodes) {
      if (n.id === fixed) continue
      const next = end === 'source' ? { ...e, from: n.id } : { ...e, to: n.id }
      if (clashes(s, i, next)) continue
      for (const side of ['top', 'right', 'bottom', 'left'] as Side[]) {
        targets.push({ ...withEdge(base, i, next, { ...s.sides[key], [end]: side }), reattach: { edge: i, end } })
      }
    }
    const p = end === 'source' ? edgeEnds(s, i)?.p1 : edgeEnds(s, i)?.p2
    const loose = d.vary({ ...base, reattach: { edge: i, end, free: { x: p?.[0] ?? 0, y: p?.[1] ?? 0 } } }, [param('reattach', 'free', 'x'), param('reattach', 'free', 'y')]).onDrop(s)
    return d
      .closest(targets)
      .withFloating()
      .whenFar(loose, { gap: END_SNAP })
      .withBranchTransition(120)
      .onDrop((q) => (q.reattach?.free ? s : { ...q, reattach: undefined }))
  }

  // A new arrow out of box `from`. Over another box, the finished arrow;
  // over empty canvas, a box there to receive it (made on drop).
  const draftSpec = (d: DragSpecBuilder<Doc>, s: Doc, from: string, side: Side): DragSpec<Doc> => {
    const b = s.nodes[from]
    const [x, y] = dotPoint(b, side)
    const start: Doc = { ...s, draft: { from, side, free: { x, y } } }
    const free = d.vary(start, [param('draft', 'free', 'x'), param('draft', 'free', 'y')])
    const overBox = s.spec.nodes
      .filter((n) => n.id !== from && !s.spec.edges.some((e) => e.from === from && e.to === n.id))
      .map((n) => d.dropTarget(ids.node(c, n.id), { ...start, draft: { from, side, to: n.id, free: { x, y } } }))
    const follow = d
      .closest(overBox)
      .withFloating()
      .whenFar(free, { gap: 1 })
      .onDrop((q) => finishDraft(q, s))
    return d.switchToStateAndFollow(start, `${uid}-draft`, follow)
  }

  const finishDraft = (q: Doc, before: Doc): Doc => {
    const dr = q.draft
    if (!dr) return before
    if (dr.to) return { ...before, spec: { ...before.spec, edges: [...before.spec.edges, { from: dr.from, to: dr.to }] } }
    // Dropped on its own box (or barely moved): nothing.
    const fb = before.nodes[dr.from]
    if (fb && inside(fb, dr.free.x, dr.free.y)) return before
    return addBoxDoc(before, dr.free.x, dr.free.y, dr.from).doc
  }

  const labelSpec = (d: DragSpecBuilder<Doc>, s: Doc, i: number): DragSpec<Doc> => {
    const key = edgeKey(s.spec.edges[i])
    const at = s.sides[key]?.labelAt ?? edgeEnds(s, i)?.at ?? 0.5
    const base = { ...s, sides: { ...s.sides, [key]: { ...s.sides[key], labelAt: at } } }
    return d.vary(base, param('sides', key, 'labelAt'), { constraint: (p) => inOrder([0.05, p.sides[key].labelAt ?? 0.5, 0.95]) })
  }

  // Where an edge runs in a doc (null if an end is missing).
  const edgeEnds = (s: Doc, i: number): EdgeGeom | null => {
    const e = s.spec.edges[i]
    return e ? (routeEdges(s.spec, { nodes: s.nodes, groups: {} }, s.sides).get(edgeKey(e)) ?? null) : null
  }

  // ---- drawing ------------------------------------------------------------
  const single = sel.length === 1 ? sel[0] : null
  const dotsFor = editing || dragging ? null : (hoverNode ?? (single?.kind === 'node' ? single.id : null))
  const fonts = useFontEpoch()

  const draggable = useCallback<Draggable<Doc>>(
    ({ state: s, d, draggedId, isTracking }) => {
      const groups = drawnGroups(s)
      const placed = { nodes: s.nodes, groups }
      // While Dragology only tracks where a dragged box, group or note
      // lands, it draws many states per pointer move and the arrows don't
      // matter: skip routing them. Everything else needs the routes, and
      // the frame's grips need the frame even when tracking.
      const lean = isTracking && /^(n|g|a|rs)-/.test(draggedId?.slice(uid.length + 1) ?? '')
      const routes = lean ? new Map<string, EdgeGeom>() : routeEdges(s.spec, placed, s.sides)
      const frame = lean ? null : padBox(contentBounds(s.spec, placed, { edges: s.sides, annotations: s.annots }), s.pad)
      const k = view.k
      const handle = 7 / k
      const selected = (kind: Item['kind'], id: string) => sel.some((x) => x.kind === kind && x.id === id)

      // Alignment guides while a box is dragged.
      const guides: ReactNode[] = []
      const dragged = draggedId ? s.spec.nodes.find((n) => ids.node(c, n.id) === draggedId) : undefined
      if (dragged && !isTracking) {
        const b = s.nodes[dragged.id]
        for (const [id, o] of Object.entries(s.nodes)) {
          if (id === dragged.id) continue
          for (const x of [o.x, o.x + o.w / 2, o.x + o.w]) {
            if ([b.x, b.x + b.w / 2, b.x + b.w].some((m) => Math.abs(m - x) < 0.5)) {
              guides.push(<line className="mn-dg-guide" x1={x} x2={x} y1={Math.min(o.y, b.y) - 12} y2={Math.max(o.y + o.h, b.y + b.h) + 12} />)
            }
          }
          for (const y of [o.y, o.y + o.h / 2, o.y + o.h]) {
            if ([b.y, b.y + b.h / 2, b.y + b.h].some((m) => Math.abs(m - y) < 0.5)) {
              guides.push(<line className="mn-dg-guide" y1={y} y2={y} x1={Math.min(o.x, b.x) - 12} x2={Math.max(o.x + o.w, b.x + b.w) + 12} />)
            }
          }
        }
      }

      // The arrow being re-attached, when its end is loose.
      const loose = s.reattach?.free
      const draft = s.draft

      return (
        <g transform={translate(view.x, view.y) + scale(k)}>
          {!isTracking && (
            <rect
              dragologyKey="canvas"
              className="mn-dg-canvas"
              x={-1e5}
              y={-1e5}
              width={2e5}
              height={2e5}
              onPointerDown={onBackgroundDown}
              onClick={onBackgroundClick}
              onDoubleClick={(e) => {
                const p = toDiagram(e.clientX, e.clientY)
                addBox(p.x, p.y)
              }}
            />
          )}
          {each(s.spec.groups ?? [], (g) => {
            const b = groups[g.id]
            if (!b) return null
            const it: Item = { kind: 'group', id: g.id }
            const on = selected('group', g.id)
            return drawGroup(c, { ...g, label: editing?.kind === 'group' && editing.id === g.id ? '' : g.label }, b, {
              props: { 'data-on': flags(on && 'selected'), dragologyZIndex: -1 },
              children: (
                <g>
                  <rect
                    className="mn-dg-group-grip"
                    width={b.w}
                    height={34}
                    dragologyOnDrag={() => moveSpec(d, s, it)}
                    onClick={(e) => select(it, e.shiftKey)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setEditing({ kind: 'group', id: g.id })
                    }}
                  />
                  {on && sel.length === 1 && resizeGrip(`${uid}-rs-g-${g.id}`, b.w, b.h, handle, () => resizeSpec(d, s, it))}
                </g>
              ),
            })
          })}
          {each(s.spec.edges, (e, i) => {
            const g = routes.get(edgeKey(e))
            if (!g) return null
            const on = selEdge === i
            const hide = (s.reattach?.edge === i && loose) || (editing?.kind === 'edge' && editing.id === String(i))
            // The label is its own layer, so it takes the same clicks.
            const clicks = {
              onClick: (ev: React.MouseEvent) => {
                ev.stopPropagation()
                setSel([])
                setSelEdge(i)
              },
              onDoubleClick: (ev: React.MouseEvent) => {
                ev.stopPropagation()
                setSelEdge(i)
                setEditing({ kind: 'edge', id: String(i) })
              },
            }
            return drawEdge(c, e, i, g, {
              on: flags(on && 'selected', hide && 'hidden'),
              label: editing?.kind === 'edge' && editing.id === String(i) ? '' : undefined,
              props: clicks,
              labelProps: { ...clicks, ...(on ? { dragologyOnDrag: () => labelSpec(d, s, i), 'data-on': 'grabbable' } : {}) },
            })
          })}
          {loose && s.reattach && (() => {
            const e = s.spec.edges[s.reattach.edge]
            const fixed = s.nodes[s.reattach.end === 'source' ? e.to : e.from]
            if (!fixed) return null
            const [ax, ay] = borderPoint(fixed, loose.x, loose.y)
            return <line dragologyKey="loose" className="mn-dg-wire" x1={ax} y1={ay} x2={loose.x} y2={loose.y} />
          })()}
          {each(s.spec.nodes, (n) => {
            const b = s.nodes[n.id]
            if (!b) return null
            const it: Item = { kind: 'node', id: n.id }
            const on = selected('node', n.id)
            const isEditing = editing?.kind === 'node' && editing.id === n.id
            return drawNode(c, isEditing ? { ...n, label: '' } : n, b, {
              on: flags(on && 'selected', unarranged.has(n.id) && 'unarranged'),
              props: {
                dragologyOnDrag: () => moveSpec(d, s, it),
                dragologyZIndex: draggedId === ids.node(c, n.id) ? '/1' : false,
                onClick: (ev) => select(it, ev.shiftKey),
                onDoubleClick: (ev) => {
                  ev.stopPropagation()
                  setEditing({ kind: 'node', id: n.id })
                },
                onPointerEnter: () => setHoverNode(n.id),
                onPointerLeave: () => setHoverNode((h) => (h === n.id ? null : h)),
              },
              children: (
                <g>
                  {n.detail && <circle dragologyKey="mark" className="mn-dg-detail-mark" transform={translate(b.w - 8, 8)} r={3} />}
                  {on && sel.length === 1 && !isEditing && resizeGrip(`${uid}-rs-n-${n.id}`, b.w, b.h, handle, () => resizeSpec(d, s, it))}
                </g>
              ),
            })
          })}
          {each(s.annots, (a) => {
            const it: Item = { kind: 'annot', id: a.id }
            const on = selected('annot', a.id)
            const isEditing = editing?.kind === 'annot' && editing.id === a.id
            return drawAnnot(c, isEditing ? { ...a, text: '' } : a, {
              on: flags(on && 'selected'),
              props: {
                dragologyOnDrag: () => moveSpec(d, s, it),
                onClick: (ev) => select(it, ev.shiftKey),
                onDoubleClick: (ev) => {
                  ev.stopPropagation()
                  setEditing({ kind: 'annot', id: a.id })
                },
              },
              children: on && sel.length === 1 && !isEditing ? resizeGrip(`${uid}-rs-a-${a.id}`, a.w, a.h, handle, () => resizeSpec(d, s, it)) : null,
            })
          })}
          {/* A new arrow being drawn out of a box. */}
          {draft && (() => {
            const a = s.nodes[draft.from]
            const to = draft.to ? s.nodes[draft.to] : null
            if (!a) return null
            const g = to ? routeEdges({ ...s.spec, edges: [...s.spec.edges, { from: draft.from, to: draft.to! }] }, { nodes: s.nodes, groups: {} }, s.sides).get(`${draft.from}--${draft.to}`) : null
            const [ex, ey] = g ? g.p2 : [draft.free.x, draft.free.y]
            return (
              <g dragologyKey="draft">
                {g ? (
                  drawEdge(c, { from: draft.from, to: draft.to! }, s.spec.edges.length, g, { on: 'draft' })
                ) : (
                  <line className="mn-dg-wire" x1={dotPoint(a, draft.side)[0]} y1={dotPoint(a, draft.side)[1]} x2={ex} y2={ey} />
                )}
                <circle id={`${uid}-draft`} className="mn-dg-end" transform={translate(ex, ey)} r={handle * 0.8} />
              </g>
            )
          })()}
          {/* The selected arrow's end handles. */}
          {(selEdge !== null || s.reattach) && (() => {
            const i = s.reattach?.edge ?? (selEdge as number)
            const e = s.spec.edges[i]
            const g = e && routes.get(edgeKey(e))
            if (!g) return null
            const p1 = s.reattach?.end === 'source' && loose ? [loose.x, loose.y] : g.p1
            const p2 = s.reattach?.end === 'target' && loose ? [loose.x, loose.y] : g.p2
            return (
              <g dragologyKey="ends">
                <circle id={`${uid}-end-source`} className="mn-dg-end" transform={translate(p1[0], p1[1])} r={handle} dragologyOnDrag={() => endSpec(d, s, i, 'source')} />
                <circle id={`${uid}-end-target`} className="mn-dg-end" transform={translate(p2[0], p2[1])} r={handle} dragologyOnDrag={() => endSpec(d, s, i, 'target')} />
              </g>
            )
          })()}
          {/* Connect dots on the box under the pointer (or selected). */}
          {dotsFor && s.nodes[dotsFor] && !s.draft && (
            <g dragologyKey="dots">
              {each(['top', 'right', 'bottom', 'left'] as Side[], (side) => {
                const [x, y] = dotPoint(s.nodes[dotsFor], side)
                return (
                  <circle
                    id={`${uid}-dot-${side}`}
                    className="mn-dg-dot"
                    transform={translate(x, y)}
                    r={5.5 / k}
                    onPointerEnter={() => setHoverNode(dotsFor)}
                    dragologyOnDrag={() => draftSpec(d, s, dotsFor, side)}
                  />
                )
              })}
            </g>
          )}
          {guides.length > 0 && (
            <g dragologyKey="guides" className="mn-dg-guides">
              {each(guides, (g) => g)}
            </g>
          )}
          {!isTracking && frame && (
            <g dragologyKey="frame">
              <path className="mn-dg-dim" fillRule="evenodd" d={`M ${-1e5} ${-1e5} H ${1e5} V ${1e5} H ${-1e5} Z M ${frame.x} ${frame.y} V ${frame.y + frame.h} H ${frame.x + frame.w} V ${frame.y} Z`} />
              <rect
                className="mn-dg-frame"
                data-on={flags(selected('frame', 'frame') && 'selected', frameStatus(s.pad) === 'crop' && 'crop')}
                x={frame.x}
                y={frame.y}
                width={frame.w}
                height={frame.h}
              />
              <text
                className="mn-dg-frame-label"
                data-on={flags(frameStatus(s.pad) === 'crop' && 'crop')}
                transform={translate(frame.x, frame.y - 6 / k) + scale(1 / k)}
                onClick={() => select({ kind: 'frame', id: 'frame' }, false)}
              >
                {frameText(s.pad, frame.w, layout && (variant === 'narrow' ? null : layout.widths[figWide ? 'wide' : 'column']))}
              </text>
            </g>
          )}
          {frame &&
            frameGrips(uid, frame, handle, (sides) => {
              select({ kind: 'frame', id: 'frame' }, false)
              return frameSpec(d, s, sides)
            })}
        </g>
      )
    },
    // The drawing depends on everything the editor shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, sel, selEdge, editing, dotsFor, unarranged, variant, figWide, tool, fonts],
  )

  const onDragStatus = useCallback((st: DragStatus<Doc>) => setDragging(st.type === 'dragging'), [])

  const onDrop = (next: Doc) => {
    const prev = docRef.current
    const clean = next.reattach || next.draft ? { ...next, reattach: undefined, draft: undefined } : next
    if (sameDoc(clean, prev)) {
      // Dragology's state must still follow the drop (a snapped-back end).
      setDocState(prev)
      return
    }
    commit(clean)
    // A box made by dropping a new arrow on empty canvas: name it.
    const made = clean.spec.nodes.find((n) => !prev.nodes[n.id])
    if (made) {
      setSel([{ kind: 'node', id: made.id }])
      setEditing({ kind: 'node', id: made.id })
      return
    }
    if (clean.spec.edges.length > prev.spec.edges.length) {
      setSel([])
      setSelEdge(clean.spec.edges.length - 1)
      return
    }
    const it = grabbed.current
    grabbed.current = null
    if (it && !isSel(it.kind, it.id) && it.kind !== 'frame') setSel([it])
    for (const id of Object.keys(clean.nodes)) {
      if (unarranged.has(id) && clean.nodes[id] !== prev.nodes[id]) {
        setUnarranged((u) => {
          const n = new Set(u)
          n.delete(id)
          return n
        })
      }
    }
  }

  // ---- what's selected (toolbars) ---------------------------------------
  const singleSpec = single?.kind === 'node' ? doc.spec.nodes.find((n) => n.id === single.id) : undefined
  const selKey = sel.map((s) => `${s.kind}:${s.id}`).join(',')
  useEffect(() => setDetailOpen(false), [selKey])
  const edgeSpec = selEdge !== null ? doc.spec.edges[selEdge] : undefined

  // The selection's bounds on screen, for placing its toolbar.
  const selBox = (): Box | null => {
    let b: Box | null = null
    const groups = drawnGroups(doc)
    for (const it of sel) {
      const o = it.kind === 'node' ? doc.nodes[it.id] : it.kind === 'annot' ? doc.annots.find((a) => a.id === it.id) : it.kind === 'group' ? groups[it.id] : frameOf(doc)
      if (o) b = union(b, o)
    }
    return b
  }

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
              onClick={() => commit(updateNode(single.id, { kind }))}
            >
              <svg viewBox="0 0 30 18" width="30" height="18" aria-hidden="true" className="mn-dg-node" data-kind={kind}>
                <rect className="mn-dg-shape" x={1.5} y={1.5} width={27} height={15} rx={kind === 'store' ? 7.5 : kind === 'external' ? 6 : 3} />
                <rect className="mn-dg-shape mn-dg-shape-inner" x={4} y={4} width={22} height={10} rx={1} />
              </svg>
            </button>
          ))}
        </span>
        <Sep />
        <button type="button" aria-pressed={iconOpen} onClick={() => setIconOpen((o) => !o)} title="Draw this as an icon tile with the label outside">
          {singleSpec.icon ? 'Icon ✓' : 'Icon'}
        </button>
        {singleSpec.icon && (
          <button
            type="button"
            title="Where the label sits"
            onClick={() => {
              const order = ['below', 'right', 'above', 'left'] as const
              const cur = order.indexOf(singleSpec.labelSide ?? 'below')
              commit(updateNode(single.id, { labelSide: order[(cur + 1) % 4] === 'below' ? undefined : order[(cur + 1) % 4] }))
            }}
          >
            Label: {singleSpec.labelSide ?? 'below'}
          </button>
        )}
        <button type="button" aria-pressed={Boolean(singleSpec.dashed)} onClick={() => commit(updateNode(single.id, { dashed: !singleSpec.dashed }))} title="Dashed outline: not there yet, or proposed">
          Dashed
        </button>
        <Sep />
        <button type="button" aria-pressed={detailOpen} onClick={() => setDetailOpen((o) => !o)} title="Shown to readers when they hover the box">
          {singleSpec.detail ? 'Hover text ✓' : 'Hover text'}
        </button>
        <Sep />
        <button type="button" className="is-danger" onClick={deleteSelection} title="Backspace">
          Delete
        </button>
        {iconOpen && (
          <div className="mn-diagram-icons">
            <span className="mn-diagram-kinds" role="radiogroup" aria-label="Icon">
              <button type="button" role="radio" aria-checked={!singleSpec.icon} className="mn-diagram-kind" title="No icon: a labelled box" onClick={() => commit(updateNode(single.id, { icon: undefined }))}>
                <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">
                  <rect className="mn-dg-shape" x={-10} y={-6} width={20} height={12} rx={2} />
                </svg>
              </button>
              {glyphNames().map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={singleSpec.icon === name}
                  title={name}
                  aria-label={name}
                  className="mn-diagram-kind"
                  onClick={() => commit(updateNode(single.id, { icon: name }))}
                >
                  <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true" className="mn-dg-node" data-on={singleSpec.tone ? `tone-${singleSpec.tone}` : undefined}>
                    <g className="mn-dg-glyph">{glyph(name)}</g>
                  </svg>
                </button>
              ))}
            </span>
            {singleSpec.icon && (
              <span className="mn-diagram-kinds" role="radiogroup" aria-label="Colour">
                {TONES.map((t) => (
                  <button
                    key={t ?? 'plain'}
                    type="button"
                    role="radio"
                    aria-checked={(singleSpec.tone ?? null) === t}
                    title={t ?? 'plain'}
                    aria-label={`Colour: ${t ?? 'plain'}`}
                    className="mn-diagram-kind"
                    onClick={() => commit(updateNode(single.id, { tone: t ?? undefined }))}
                  >
                    <span className="mn-diagram-swatch" data-tone={t ?? 'plain'} />
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
        {detailOpen && (
          <textarea
            className="mn-diagram-detail"
            autoFocus
            rows={2}
            placeholder="What readers see when they hover this box"
            defaultValue={singleSpec.detail ?? ''}
            onBlur={(e) => {
              if ((singleSpec.detail ?? '') !== e.target.value) commit(updateNode(single.id, { detail: e.target.value }))
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
                setDetailOpen(false)
              }
            }}
          />
        )}
      </>
    )
  } else if (single?.kind === 'annot') {
    const a = doc.annots.find((x) => x.id === single.id)
    toolbar = a && (
      <>
        {(['text', 'note'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={a.kind === k}
            onClick={() => a.kind !== k && commit({ ...docRef.current, annots: docRef.current.annots.map((x) => (x.id === a.id ? { ...x, kind: k } : x)) })}
          >
            {k === 'text' ? 'Text' : 'Note'}
          </button>
        ))}
        <Sep />
        <button type="button" className="is-danger" onClick={deleteSelection}>
          Delete
        </button>
      </>
    )
  } else if (single?.kind === 'group') {
    toolbar = (
      <button type="button" onClick={() => setEditing({ kind: 'group', id: single.id })}>
        Rename group
      </button>
    )
  } else if (single?.kind === 'frame') {
    toolbar = samePad(doc.pad, DEFAULT_PAD) ? (
      <span className="mn-diagram-toolbar-note">Fits the content. Drag an edge or corner to add room around it, or to crop.</span>
    ) : (
      <button type="button" onClick={() => commit({ ...docRef.current, pad: DEFAULT_PAD })}>
        Fit to content
      </button>
    )
  } else if (sel.filter((s) => s.kind === 'node' || s.kind === 'annot').length >= 2) {
    const n = sel.filter((s) => s.kind === 'node' || s.kind === 'annot').length
    const specIds = sel.filter((s) => s.kind === 'node').map((s) => s.id)
    toolbar = (
      <>
        <IconButton label="Align left" onClick={() => align('left')} d="M3 2v12M6 4h7v3H6zM6 9h4v3H6z" />
        <IconButton label="Align centers" onClick={() => align('hcenter')} d="M8 2v12M4 4h8v3H4zM5.5 9h5v3h-5z" />
        <IconButton label="Align right" onClick={() => align('right')} d="M13 2v12M3 4h7v3H3zM6 9h4v3H6z" />
        <Sep />
        <IconButton label="Align tops" onClick={() => align('top')} d="M2 3h12M4 6v7h3V6zM9 6v4h3V6z" />
        <IconButton label="Align middles" onClick={() => align('vcenter')} d="M2 8h12M4 4v8h3V4zM9 5.5v5h3v-5z" />
        <IconButton label="Align bottoms" onClick={() => align('bottom')} d="M2 13h12M4 3v7h3V3zM9 6v4h3V6z" />
        {n >= 3 && (
          <>
            <Sep />
            <IconButton label="Space evenly across" onClick={() => align('hspread')} d="M2 2v12M14 2v12M6 5h4v6H6z" />
            <IconButton label="Space evenly down" onClick={() => align('vspread')} d="M2 2h12M2 14h12M5 6h6v4H5z" />
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

  const edgeGeomNow = selEdge !== null ? edgeEnds(doc, selEdge) : null
  const edgeToolbar = edgeSpec && selEdge !== null && edgeGeomNow && (
    <>
      <button type="button" onClick={() => setEditing({ kind: 'edge', id: String(selEdge) })} title="Double-click the arrow, or Enter">
        {edgeSpec.label ? 'Edit label' : 'Add label'}
      </button>
      <button type="button" aria-pressed={Boolean(edgeSpec.dashed)} onClick={() => updateEdge(selEdge, { dashed: !edgeSpec.dashed })}>
        Dashed
      </button>
      <button type="button" onClick={() => reverseEdge(selEdge)} title="Point the arrow the other way">
        Reverse
      </button>
      <Sep />
      <span className="mn-diagram-kinds" role="radiogroup" aria-label="Direction">
        {ARROWS.map((a) => (
          <button
            key={a.v}
            type="button"
            role="radio"
            aria-checked={(edgeSpec.arrows ?? 'end') === a.v}
            title={a.name}
            aria-label={a.name}
            className="mn-diagram-kind"
            onClick={() => updateEdge(selEdge, { arrows: a.v === 'end' ? undefined : a.v })}
          >
            {a.glyph}
          </button>
        ))}
      </span>
      <span className="mn-diagram-kinds" role="radiogroup" aria-label="Colour">
        {TONES.map((t) => (
          <button
            key={t ?? 'plain'}
            type="button"
            role="radio"
            aria-checked={(edgeSpec.family ?? null) === t}
            title={t ?? 'plain'}
            aria-label={`Colour: ${t ?? 'plain'}`}
            className="mn-diagram-kind"
            onClick={() => updateEdge(selEdge, { family: t ?? undefined })}
          >
            <span className="mn-diagram-swatch" data-tone={t ?? 'plain'} />
          </button>
        ))}
      </span>
      {(doc.sides[edgeKey(edgeSpec)]?.source || doc.sides[edgeKey(edgeSpec)]?.target) && (
        <button type="button" onClick={() => autoSides(selEdge)} title="Let the arrow pick its own sides again">
          Auto sides
        </button>
      )}
      <Sep />
      <button type="button" className="is-danger" onClick={deleteSelection} title="Backspace">
        Delete
      </button>
    </>
  )

  const showToolbars = !editing && !dragging && !marquee
  const tb = toolbar && showToolbars ? selBox() : null
  const unplaced = unarranged.size

  const hint = notice
    ? notice
    : dragging
      ? 'Drop to keep · far from every box, an arrow end snaps back'
      : editing
        ? 'Enter to finish · Shift+Enter for a new line · Esc to cancel'
        : tool === 'box'
          ? 'Click to place a box · Esc to cancel'
          : tool === 'text' || tool === 'note'
            ? `Click to place a ${tool === 'text' ? 'text label' : 'note'} · Esc to cancel`
            : selEdge !== null
              ? 'Drag an end to another side or box · drag the label along the arrow · double-click to label · Backspace deletes'
              : singleSpec
                ? 'Drag a dot to connect, or drop it on empty canvas for a new box · drag into a group to join it · Tab adds the next box · Enter renames'
                : sel.length > 1
                  ? 'Drag to move together · arrow keys nudge (Shift = 10px)'
                  : unplaced && !dirty.current
                    ? `${unplaced} box${unplaced > 1 ? 'es are' : ' is'} new and placed automatically (dashed outline): drag into place`
                    : 'Double-click the canvas for a new box · drag a box’s dot to connect · drag the canvas to select · scroll or Space-drag to pan'

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
              title={v === 'wide' ? 'What readers see when it fits' : 'What phones get when the wide arrangement would shrink labels too far'}
              onClick={() => void switchVariant(v)}
            >
              {v === 'wide' ? 'Wide' : 'Narrow (phones)'}
            </button>
          ))}
        </span>
        {layout && (
          <span className="mn-diagram-variant" role="radiogroup" aria-label="Figure width">
            {[false, true].map((w) => (
              <button
                key={String(w)}
                type="button"
                role="radio"
                aria-checked={figWide === w}
                className={figWide === w ? 'is-on' : undefined}
                title={w ? 'Break out of the text column' : 'The width of the text column'}
                onClick={() => {
                  if (figWide !== w) dirty.current = true
                  setFigWide(w)
                }}
              >
                {w ? 'Wide' : 'Column'}
              </button>
            ))}
          </span>
        )}
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
      <div
        ref={canvasRef}
        className={`mn-diagram-editor-canvas mn-diagram-arrange is-tool-${tool}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {size.w > 0 && <DragRenderer draggable={draggable} state={doc} width={size.w} height={size.h} onDropState={onDrop} onDragStatus={onDragStatus} />}
        {marquee && (
          <div
            className="mn-diagram-marquee"
            style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
          />
        )}
        {editing && <TextEditor key={`${editing.kind}:${editing.id}`} doc={doc} editing={editing} view={view} onDone={(t) => commitText(editing, t)} />}
        {tb && (
          <div className="mn-diagram-toolbar" style={{ ...toScreen(tb.x + tb.w / 2, single?.kind === 'frame' ? tb.y + tb.h : tb.y), transform: single?.kind === 'frame' ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))' }}>
            {toolbar}
          </div>
        )}
        {edgeToolbar && showToolbars && edgeGeomNow && (
          <div className="mn-diagram-toolbar mn-diagram-toolbar--edge" style={{ ...toScreen(edgeGeomNow.lx, edgeTop(doc, selEdge as number, edgeGeomNow)), transform: 'translate(-50%, calc(-100% - 14px))' }}>
            {edgeToolbar}
          </div>
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
        <div className="mn-diagram-zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(view.k / 1.25, size.w / 2, size.h / 2)}>
            −
          </button>
          <button type="button" title="Fit the diagram on screen" onClick={fitView}>
            {Math.round(view.k * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(view.k * 1.25, size.w / 2, size.h / 2)}>
            +
          </button>
        </div>
      </div>
    </>
  )
}

// ---- pieces ----------------------------------------------------------------

// Above an arrow and both its boxes, for its toolbar.
function edgeTop(doc: Doc, i: number, g: EdgeGeom): number {
  const e = doc.spec.edges[i]
  const ys = [g.ly - 12, ...g.pts.map((p) => p[1])]
  for (const id of [e?.from, e?.to]) if (id && doc.nodes[id]) ys.push(doc.nodes[id].y)
  return Math.min(...ys)
}

// Where a box's connect dot sits: just outside the middle of a side.
function dotPoint(b: Box, side: Side): [number, number] {
  const [x, y] = sidePoint(b, side)
  const o = 10
  return side === 'top' ? [x, y - o] : side === 'bottom' ? [x, y + o] : side === 'left' ? [x - o, y] : [x + o, y]
}

function resizeGrip(id: string, w: number, h: number, r: number, spec: () => DragSpec<Doc>) {
  return <rect id={id} className="mn-dg-grip" transform={translate(w - r * 0.6, h - r * 0.6)} width={r * 1.2} height={r * 1.2} rx={1.5} dragologyOnDrag={spec} />
}

// The frame's edges and corners, each setting the margins on its sides.
function frameGrips(uid: string, f: Box, r: number, spec: (sides: (keyof Pad)[]) => DragSpec<Doc>) {
  const strip = r * 1.4
  const x1 = f.x + f.w
  const y1 = f.y + f.h
  return (
    <g dragologyKey="grips">
      <rect id={`${uid}-fr-top`} className="mn-dg-frame-edge is-ns" transform={translate(f.x, f.y - strip / 2)} width={f.w} height={strip} dragologyOnDrag={() => spec(['top'])} />
      <rect id={`${uid}-fr-bottom`} className="mn-dg-frame-edge is-ns" transform={translate(f.x, y1 - strip / 2)} width={f.w} height={strip} dragologyOnDrag={() => spec(['bottom'])} />
      <rect id={`${uid}-fr-left`} className="mn-dg-frame-edge is-ew" transform={translate(f.x - strip / 2, f.y)} width={strip} height={f.h} dragologyOnDrag={() => spec(['left'])} />
      <rect id={`${uid}-fr-right`} className="mn-dg-frame-edge is-ew" transform={translate(x1 - strip / 2, f.y)} width={strip} height={f.h} dragologyOnDrag={() => spec(['right'])} />
      {each(
        [
          ['tl', f.x, f.y, ['top', 'left']],
          ['tr', x1, f.y, ['top', 'right']],
          ['bl', f.x, y1, ['bottom', 'left']],
          ['br', x1, y1, ['bottom', 'right']],
        ] as [string, number, number, (keyof Pad)[]][],
        ([k, x, y, sides]) => (
          <rect id={`${uid}-fr-${k}`} className={`mn-dg-frame-corner is-${k}`} transform={translate(x - r * 0.65, y - r * 0.65)} width={r * 1.3} height={r * 1.3} rx={1.5} dragologyOnDrag={() => spec(sides)} />
        ),
      )}
    </g>
  )
}

// In-place text editing over the canvas: Enter (or clicking away) keeps,
// Shift+Enter is a new line, Escape cancels.
function TextEditor({ doc, editing, view, onDone }: { doc: Doc; editing: NonNullable<Editing>; view: View; onDone: (v: string | null) => void }) {
  let box: Box | null = null
  let value = ''
  let cls = ''
  let multiline = true
  const tileNode = editing.kind === 'node' ? doc.spec.nodes.find((n) => n.id === editing.id && isTile(n)) : undefined
  if (editing.kind === 'node' && tileNode && doc.nodes[editing.id]) {
    // A tile's label is edited where it is drawn, outside the tile.
    const l = tileLabelBox({ ...tileNode, label: tileNode.label || 'Name' }, doc.nodes[editing.id])
    const w = Math.max(150, (l?.w ?? 0) + 24)
    const side = tileNode.labelSide ?? 'below'
    box = l && {
      x: side === 'left' ? l.x + l.w - w + 6 : side === 'right' ? l.x - 6 : l.x + l.w / 2 - w / 2,
      y: l.y - 3,
      w,
      h: Math.max(24, l.h + 6),
    }
    value = tileNode.label
    cls = `is-tile is-${side}`
  } else if (editing.kind === 'node') {
    box = doc.nodes[editing.id] ?? null
    value = doc.spec.nodes.find((n) => n.id === editing.id)?.label ?? ''
    cls = 'is-node'
  } else if (editing.kind === 'annot') {
    const a = doc.annots.find((x) => x.id === editing.id)
    box = a ?? null
    value = a?.text ?? ''
    cls = `is-annot is-${a?.kind}`
  } else if (editing.kind === 'group') {
    const g = drawnGroups(doc)[editing.id]
    box = g ? { x: g.x + 8, y: g.y + 6, w: Math.max(140, g.w - 16), h: 24 } : null
    value = doc.spec.groups?.find((x) => x.id === editing.id)?.label ?? ''
    cls = 'is-group'
    multiline = false
  } else {
    const i = Number(editing.id)
    const e = doc.spec.edges[i]
    const g = e && routeEdges(doc.spec, { nodes: doc.nodes, groups: {} }, doc.sides).get(edgeKey(e))
    if (g) {
      const w = Math.max(120, edgeLabelWidth(e.label ?? '', e.arrows) + 20)
      box = { x: g.lx - w / 2, y: g.ly - 12, w, h: 24 }
    }
    value = e?.label ?? ''
    cls = 'is-edge'
    multiline = false
  }
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  useEffect(() => ref.current?.select(), [])
  if (!box) return null
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <textarea
      ref={ref}
      className={`mn-dg-text-edit ${cls}`}
      style={{
        left: box.x * view.k + view.x,
        top: box.y * view.k + view.y,
        width: box.w,
        height: box.h,
        transform: `scale(${view.k})`,
        // A box's label sits in the middle, as it's drawn.
        ...(editing.kind === 'node' && !tileNode ? { paddingTop: Math.max(0, (box.h - draft.split('\n').length * 18.75) / 2) } : {}),
      }}
      value={draft}
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

// The margins a saved arrangement asks for. A pre-0.9.1 fixed frame box
// becomes the margins it implied around today's content.
function padFrom(spec: DiagramSpec, placement: Placement, baked: Pick<BakedDiagram, 'edges' | 'annotations' | 'framePad' | 'frame'> | null): Pad {
  if (baked?.framePad) return baked.framePad
  if (baked?.frame) return padBetween(contentBounds(spec, placement, baked), baked.frame)
  return DEFAULT_PAD
}

const samePad = (a: Pad, b: Pad) => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
const roundPad = (p: Pad): Pad => ({ top: Math.round(p.top), right: Math.round(p.right), bottom: Math.round(p.bottom), left: Math.round(p.left) })

function frameStatus(p: Pad): 'fit' | 'extra' | 'crop' {
  if (p.top < 0 || p.right < 0 || p.bottom < 0 || p.left < 0) return 'crop'
  return samePad(p, DEFAULT_PAD) ? 'fit' : 'extra'
}

// The frame's tab: what readers see, and what the figure's width does to
// it (see DiagramFigure: shrink to the 13px label floor, then the narrow
// arrangement, then sideways scroll).
function frameText(p: Pad, frameW: number, avail: number | null | undefined): string {
  const st = frameStatus(p)
  let s = `Reader view${st === 'extra' ? ' · extra room' : st === 'crop' ? ' · cropping content' : ''}`
  if (avail && frameW > avail) {
    const zoom = avail / frameW
    s += zoom * 15 >= 13 ? ` · shrinks to ${Math.round(zoom * 100)}% to fit` : ' · too wide to read: readers get the narrow layout'
  }
  return s
}

function pickArrangement(a: Arrangement): Arrangement {
  const { nodes, groups, edges, annotations, framePad } = a
  return {
    ...(nodes && Object.keys(nodes).length ? { nodes } : {}),
    ...(groups && Object.keys(groups).length ? { groups } : {}),
    ...(edges && Object.keys(edges).length ? { edges } : {}),
    ...(annotations?.length ? { annotations } : {}),
    ...(framePad ? { framePad } : {}),
  }
}

// Same content, ignoring object identity (a drag that changed nothing).
const sameDoc = (a: Doc, b: Doc) =>
  JSON.stringify([a.spec, a.nodes, a.groups, a.sides, a.annots, a.pad]) === JSON.stringify([b.spec, b.nodes, b.groups, b.sides, b.annots, b.pad])

function overlaps(a: Box, b: Box, m = 16) {
  return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m
}
