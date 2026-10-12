import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Tldraw,
  createBindingId,
  createShapeId,
  toRichText,
  DefaultFontStyle,
  DefaultSizeStyle,
  type Editor,
  type TLShapeId,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { saveContentFile } from '../../lib/EditContext'
import { THEMES } from './theme'
import { nodeSize, place } from './layout'
import { edgeKey, specHash, type BakedDiagram, type Box, type DiagramSpec, type NodeKind } from './spec'

// Dev-only full-screen tldraw editor for one diagram figure. Lazy-loaded
// from DiagramFigure behind `import.meta.env.DEV`, so a production build
// contains no tldraw code (tldraw needs a license key on production hosts;
// readers get the baked SVG instead).
//
// Open: load the saved tldraw document if there is one, then reconcile it
// with the current spec by stable id — new spec nodes/edges/groups are
// added (ELK position nudged next to the author's arrangement), removed
// ones are deleted, changed labels are updated. Everything else the author
// drew (sketches, notes, extra arrows, restyling) is left alone.
//
// Save: write the document plus the reader bake (light/dark SVG, part
// boxes, node boxes, spec hash) through the dev save endpoint, which
// auto-commits like prose edits.

const nodeId = (fig: string, id: string) => createShapeId(`${fig}.${id}`)
const groupId = (fig: string, id: string) => createShapeId(`${fig}.group.${id}`)
const edgeId = (fig: string, key: string) => createShapeId(`${fig}.edge.${key}`)

// `semi` fill = the figure background (see theme.ts); `solid` fill = the
// color's own light tint.
const KIND: Record<NodeKind, Record<string, unknown>> = {
  process: { geo: 'rectangle', fill: 'semi', color: 'black', dash: 'solid' },
  data: { geo: 'rectangle', fill: 'none', color: 'grey', dash: 'dashed' },
  store: { geo: 'oval', fill: 'solid', color: 'violet', dash: 'solid' },
  external: { geo: 'cloud', fill: 'none', color: 'grey', dash: 'solid' },
  decision: { geo: 'diamond', fill: 'solid', color: 'orange', dash: 'solid' },
  accent: { geo: 'rectangle', fill: 'solid', color: 'blue', dash: 'solid' },
  note: { geo: 'rectangle', fill: 'solid', color: 'yellow', dash: 'solid' },
}

export function docPath(figureId: string) {
  return `figures/tldraw/${figureId}.tldr.json`
}

async function fetchDoc(figureId: string): Promise<unknown | null> {
  try {
    const r = await fetch(`/content/${docPath(figureId)}?t=${Date.now()}`)
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null
    return await r.json()
  } catch {
    return null
  }
}

function pageBox(editor: Editor, id: TLShapeId): Box | undefined {
  const b = editor.getShapePageBounds(id)
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPartial = any

function segmentHits(a: Box, b: Box, o: Box): boolean {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  for (let t = 0.05; t < 0.96; t += 0.05) {
    const x = ax + (bx - ax) * t
    const y = ay + (by - ay) * t
    if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true
  }
  return false
}

// tldraw's export inlines each label's full computed style (hundreds of
// properties, ~45 KB per diagram). Drop the families that cannot affect a
// static text layout (animation, scrolling, interaction, print, paint
// effects); everything that sizes or places text is kept.
const DROP_STYLE =
  /^(-webkit-(?!text-stroke)|accent-color|anchor-|animation|app-region|appearance|backdrop|backface|background-(?!color)|baseline-source|border-(image|shape|end|start|spacing|collapse)|box-decoration|buffered|caption-side|caret|clip|color-interpolation|color-rendering|column|contain|content-visibility|counter|cursor|cx|cy|d$|dominant|empty-cells|field-sizing|filter|flood|image-|interactivity|interpolate|isolation|lighting|list-style|marker|mask|math-|mix-blend|object-|offset|orphans|outline|overlay|overscroll|page|perspective|pointer-events|position-|print-|quotes|r$|reading-|resize|ruby|rx|ry|scroll|shape-|speak|stop-|table-layout|tab-size|timeline|touch-action|transition|user-select|vector-effect|view-|visibility|widows|will-change|x$|y$|zoom)/

function slimStyles(svg: string): string {
  return svg.replace(/style="([^"]*)"/g, (_m, raw: string) => {
    // Entities like &quot; contain a semicolon; shield them from the split.
    const css = raw.replace(/&(#?\w+);/g, '\u0000$1\u0001')
    const kept = css
      .split(/;\s*/)
      .filter((decl) => {
        const prop = decl.split(':')[0]?.trim()
        return prop && !DROP_STYLE.test(prop)
      })
      .join('; ')
      .replace(/\u0000(#?\w+)\u0001/g, '&$1;')
    return `style="${kept}"`
  })
}

async function reconcile(editor: Editor, fig: string, spec: DiagramSpec) {
  const savedNodes: Record<string, Box> = {}
  for (const n of spec.nodes) {
    const b = editor.getShape(nodeId(fig, n.id)) ? pageBox(editor, nodeId(fig, n.id)) : undefined
    if (b) savedNodes[n.id] = b
  }
  const savedGroups: Record<string, Box> = {}
  for (const g of spec.groups ?? []) {
    const b = editor.getShape(groupId(fig, g.id)) ? pageBox(editor, groupId(fig, g.id)) : undefined
    if (b) savedGroups[g.id] = b
  }
  const pos = await place(spec, { nodes: savedNodes, groups: savedGroups })

  const keepNodes = new Set(spec.nodes.map((n) => n.id))
  const keepGroups = new Set((spec.groups ?? []).map((g) => g.id))
  const keepEdges = new Set(spec.edges.map(edgeKey))

  editor.run(
    () => {
      // Drop shapes whose spec entry is gone.
      const stale = editor
        .getCurrentPageShapes()
        .filter((s) => {
          const m = s.meta as Record<string, unknown>
          return (
            (typeof m.specNode === 'string' && !keepNodes.has(m.specNode)) ||
            (typeof m.specGroup === 'string' && !keepGroups.has(m.specGroup)) ||
            (typeof m.specEdge === 'string' && !keepEdges.has(m.specEdge))
          )
        })
        .map((s) => s.id)
      if (stale.length) editor.deleteShapes(stale)

      for (const g of spec.groups ?? []) {
        const id = groupId(fig, g.id)
        const b = pos.groups[g.id]
        const existing = editor.getShape(id)
        if (existing) {
          if ((existing.meta as Record<string, unknown>).label !== g.label) {
            editor.updateShape({ id, type: 'frame', props: { name: g.label }, meta: { specGroup: g.id, label: g.label } } as AnyPartial)
          }
        } else if (b) {
          editor.createShape({
            id,
            type: 'frame',
            x: b.x,
            y: b.y,
            props: { w: b.w, h: b.h, name: g.label },
            meta: { specGroup: g.id, label: g.label },
          } as AnyPartial)
        }
      }

      for (const n of spec.nodes) {
        const id = nodeId(fig, n.id)
        const existing = editor.getShape(id)
        const meta = { specNode: n.id, label: n.label, kind: n.kind ?? 'process' }
        if (existing) {
          const m = existing.meta as Record<string, unknown>
          if (m.label !== n.label) {
            // Widen (never shrink) the author's box so a longer label fits.
            const w = Math.max((existing.props as { w: number }).w, nodeSize(n.label).w)
            editor.updateShape({ id, type: 'geo', props: { richText: toRichText(n.label), w }, meta } as AnyPartial)
          }
          if (m.kind !== meta.kind) {
            editor.updateShape({ id, type: 'geo', props: KIND[meta.kind], meta } as AnyPartial)
          }
          continue
        }
        const b = pos.nodes[n.id]
        const parent = n.group ? editor.getShape(groupId(fig, n.group)) : undefined
        const pb = parent ? pageBox(editor, parent.id) : undefined
        editor.createShape({
          id,
          type: 'geo',
          parentId: parent?.id,
          x: pb ? b.x - pb.x : b.x,
          y: pb ? b.y - pb.y : b.y,
          meta: { ...meta, unarranged: b.unarranged },
          props: {
            ...KIND[meta.kind],
            w: b.w,
            h: b.h,
            size: 's',
            font: 'sans',
            richText: toRichText(n.label),
          },
        } as AnyPartial)
      }

      for (const e of spec.edges) {
        const key = edgeKey(e)
        const id = edgeId(fig, key)
        const existing = editor.getShape(id)
        if (existing) {
          if ((existing.meta as Record<string, unknown>).label !== (e.label ?? '')) {
            editor.updateShape({
              id,
              type: 'arrow',
              props: { richText: toRichText(e.label ?? '') },
              meta: { specEdge: key, label: e.label ?? '' },
            } as AnyPartial)
          }
          continue
        }
        const a = editor.getShape(nodeId(fig, e.from)) && pageBox(editor, nodeId(fig, e.from))
        const b = editor.getShape(nodeId(fig, e.to)) && pageBox(editor, nodeId(fig, e.to))
        if (!a || !b) continue
        // Straight by default; an edge that would run through another node
        // (a feedback edge, typically) bows out around the row instead.
        const others = spec.nodes
          .filter((n) => n.id !== e.from && n.id !== e.to)
          .map((n) => pageBox(editor, nodeId(fig, n.id)))
          .filter(Boolean) as Box[]
        const blocked = others.some((o) => segmentHits(a, b, o))
        const span = Math.hypot(b.x - a.x, b.y - a.y)
        editor.createShape({
          id,
          type: 'arrow',
          x: a.x + a.w / 2,
          y: a.y + a.h / 2,
          meta: { specEdge: key, label: e.label ?? '' },
          props: {
            kind: 'arc',
            bend: blocked ? Math.min(160, 40 + span * 0.18) : 0,
            dash: e.dashed ? 'dashed' : 'solid',
            size: 's',
            font: 'sans',
            color: 'grey',
            start: { x: 0, y: 0 },
            end: { x: b.x + b.w / 2 - (a.x + a.w / 2), y: b.y + b.h / 2 - (a.y + a.h / 2) },
            richText: toRichText(e.label ?? ''),
          },
        } as AnyPartial)
        editor.createBindings(
          (
            [
              ['start', e.from],
              ['end', e.to],
            ] as const
          ).map(([terminal, target]) => ({
            id: createBindingId(`${fig}.${key}.${terminal}`),
            type: 'arrow',
            fromId: id,
            toId: nodeId(fig, target),
            props: {
              terminal,
              normalizedAnchor: { x: 0.5, y: 0.5 },
              isExact: false,
              isPrecise: false,
              snap: 'none',
            },
          })) as AnyPartial,
        )
      }
    },
    { history: 'ignore' },
  )
}

async function bake(editor: Editor, fig: string, spec: DiagramSpec | undefined): Promise<BakedDiagram> {
  const ids = [...editor.getCurrentPageShapeIds()]
  if (!ids.length) return { figure: fig, specHash: specHash(spec) }
  const opts = { background: false, padding: 16 }
  const light = await editor.getSvgString(ids, { ...opts, darkMode: false })
  const dark = await editor.getSvgString(ids, { ...opts, darkMode: true })
  if (!light || !dark) throw new Error('tldraw returned an empty export')
  // The export inlines every font face it finds as base64 (hundreds of KB);
  // the article already loads its fonts, so drop them.
  const strip = (svg: string) => slimStyles(svg.replace(/@font-face\s*\{[^}]*\}/g, ''))
  const viewBox = light.svg.match(/viewBox="([^"]+)"/)?.[1] ?? `0 0 ${light.width} ${light.height}`

  const nodes: Record<string, Box> = {}
  const groups: Record<string, Box> = {}
  const parts: Record<string, Box> = {}
  for (const s of editor.getCurrentPageShapes()) {
    const m = s.meta as Record<string, unknown>
    const b = pageBox(editor, s.id)
    if (!b) continue
    if (typeof m.specNode === 'string') nodes[m.specNode] = parts[m.specNode] = b
    if (typeof m.specGroup === 'string') groups[m.specGroup] = parts[m.specGroup] = b
    if (typeof m.specEdge === 'string') parts[m.specEdge] = b
    if (typeof m.partId === 'string') parts[m.partId] = b
  }
  return {
    figure: fig,
    specHash: specHash(spec),
    nodes,
    groups,
    parts,
    svg: {
      light: strip(light.svg),
      dark: strip(dark.svg),
      viewBox,
      width: Math.round(light.width),
      height: Math.round(light.height),
    },
  }
}

type Props = { figureId: string; spec?: DiagramSpec; onClose: () => void }

export default function DiagramEditor({ figureId, spec, onClose }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [status, setStatus] = useState<string>('loading…')
  const [busy, setBusy] = useState(false)

  const onMount = useCallback(
    (ed: Editor) => {
      void (async () => {
        // Handle for scripted arranging (e.g. an agent driving the editor
        // through Playwright): window.__moonshineDiagram.editor.
        ;(window as unknown as { __moonshineDiagram?: unknown }).__moonshineDiagram = { figureId, editor: ed }
        ed.setStyleForNextShapes(DefaultFontStyle, 'sans')
        ed.setStyleForNextShapes(DefaultSizeStyle, 's')
        const doc = await fetchDoc(figureId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (doc) ed.loadSnapshot({ document: doc as any })
        if (spec) await reconcile(ed, figureId, spec)
        ed.zoomToFit({ animation: { duration: 0 } })
        const fresh = ed.getCurrentPageShapes().filter((s) => (s.meta as Record<string, unknown>).unarranged)
        setStatus(
          fresh.length
            ? `${fresh.length} new node${fresh.length > 1 ? 's' : ''} from the spec placed automatically: drag into place`
            : doc
              ? 'drag, draw, annotate · Save writes the figure'
              : spec
                ? 'laid out from the spec · drag, draw, annotate'
                : 'empty canvas · draw anything',
        )
        setEditor(ed)
      })()
    },
    [figureId, spec],
  )

  const save = async () => {
    if (!editor) return
    setBusy(true)
    try {
      // Spec shapes are arranged now; clear the "new" flags before saving.
      editor.run(
        () => {
          for (const s of editor.getCurrentPageShapes()) {
            const m = s.meta as Record<string, unknown>
            if (m.unarranged) editor.updateShape({ id: s.id, type: s.type, meta: { ...m, unarranged: false } } as AnyPartial)
          }
        },
        { history: 'ignore' },
      )
      const baked = await bake(editor, figureId, spec)
      const { document } = editor.getSnapshot()
      await saveContentFile(docPath(figureId), JSON.stringify(document))
      await saveContentFile(`figures/${figureId}.json`, JSON.stringify(baked, null, 2))
      onClose()
    } catch (err) {
      setStatus(`could not save: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const relayout = async () => {
    if (!editor || !spec) return
    // Remove only spec-owned shapes; the author's own drawings stay.
    const owned = editor
      .getCurrentPageShapes()
      .filter((s) => {
        const m = s.meta as Record<string, unknown>
        return m.specNode || m.specGroup || m.specEdge
      })
      .map((s) => s.id)
    editor.deleteShapes(owned)
    await reconcile(editor, figureId, spec)
    editor.zoomToFit({ animation: { duration: 200 } })
    setStatus('re-laid out from the spec')
  }

  return createPortal(
    <div className="mn-diagram-editor" role="dialog" aria-label={`Edit diagram ${figureId}`}>
      <div className="mn-diagram-editor-bar">
        <strong>{figureId}</strong>
        <span>{status}</span>
        <span style={{ flex: 1 }} />
        {spec && (
          <button type="button" onClick={() => void relayout()} disabled={!editor || busy}>
            Re-layout from spec
          </button>
        )}
        <button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={() => void save()} disabled={!editor || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="mn-diagram-editor-canvas">
        <Tldraw themes={THEMES} colorScheme="system" onMount={onMount} />
      </div>
    </div>,
    document.body,
  )
}
