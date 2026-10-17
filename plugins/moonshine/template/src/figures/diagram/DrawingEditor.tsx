import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { Tldraw, DefaultFontStyle, DefaultSizeStyle, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { saveContentFile } from '../../lib/EditContext'
import { THEMES } from './theme'
import type { BakedDiagram, Box } from './spec'

// Dev-only full-screen tldraw editor for a free drawing (a figure with
// kind=drawing, usually added with the "+" between blocks). Lazy-loaded
// behind import.meta.env.DEV: tldraw needs a license key on production
// hosts, so readers get the baked SVG and no tldraw code ships.
//
// Save writes two files through the dev save endpoint:
//   figures/<id>.json              light/dark SVG + part boxes (readers)
//   figures/tldraw/<id>.tldr.json  the tldraw document (re-opened here)

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

// tldraw's export inlines each label's full computed style (hundreds of
// properties, ~45 KB per diagram). Drop the families that cannot affect a
// static text layout (animation, scrolling, interaction, print, paint
// effects); everything that sizes or places text is kept.
const DROP_STYLE =
  /^(-webkit-(?!text-stroke)|accent-color|anchor-|animation|app-region|appearance|backdrop|backface|background-(?!color)|baseline-source|border-(image|shape|end|start|spacing|collapse)|box-decoration|buffered|caption-side|caret|clip$|color-interpolation|color-rendering|column|contain|content-visibility|counter|cursor|cx|cy|d$|dominant|empty-cells|field-sizing|filter|flood|image-|interactivity|interpolate|isolation|lighting|list-style|marker|mask|math-|mix-blend|object-|offset|orphans|outline|overlay|overscroll|page|perspective|pointer-events|position-|print-|quotes|r$|reading-|resize|ruby|rx|ry|scroll|shape-|speak|stop-|table-layout|tab-size|timeline|touch-action|transition|user-select|vector-effect|view-|visibility|widows|will-change|x$|y$|zoom)/

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

async function bake(editor: Editor, figureId: string): Promise<BakedDiagram> {
  const ids = [...editor.getCurrentPageShapeIds()]
  if (!ids.length) return { figure: figureId }
  const opts = { background: false, padding: 16 }
  const light = await editor.getSvgString(ids, { ...opts, darkMode: false })
  const dark = await editor.getSvgString(ids, { ...opts, darkMode: true })
  if (!light || !dark) throw new Error('tldraw returned an empty export')
  // The export inlines every font face as base64 (hundreds of KB); the
  // article already loads its fonts, so drop them.
  const strip = (svg: string) => slimStyles(svg.replace(/@font-face\s*\{[^}]*\}/g, ''))
  const viewBox = light.svg.match(/viewBox="([^"]+)"/)?.[1] ?? `0 0 ${light.width} ${light.height}`
  // Shapes tagged with meta.partId become :term targets.
  const parts: Record<string, Box> = {}
  for (const s of editor.getCurrentPageShapes()) {
    const part = (s.meta as Record<string, unknown>).partId
    const b = editor.getShapePageBounds(s.id)
    if (typeof part === 'string' && b) parts[part] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }
  }
  return {
    figure: figureId,
    ...(Object.keys(parts).length ? { parts } : {}),
    svg: {
      light: strip(light.svg),
      dark: strip(dark.svg),
      viewBox,
      width: Math.round(light.width),
      height: Math.round(light.height),
    },
  }
}

type Props = { figureId: string; onClose: () => void; onSaved?: () => void | Promise<void> }

export default function DrawingEditor({ figureId, onClose, onSaved }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [status, setStatus] = useState('loading…')
  const [busy, setBusy] = useState(false)

  const onMount = useCallback(
    (ed: Editor) => {
      void (async () => {
        // Handle for scripted drawing (an agent driving the page through
        // Playwright): window.__moonshineDrawing.editor.
        ;(window as unknown as { __moonshineDrawing?: unknown }).__moonshineDrawing = { figureId, editor: ed }
        ed.setStyleForNextShapes(DefaultFontStyle, 'sans')
        ed.setStyleForNextShapes(DefaultSizeStyle, 's')
        const doc = await fetchDoc(figureId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (doc) ed.loadSnapshot({ document: doc as any })
        if (doc) ed.zoomToFit({ animation: { duration: 0 } })
        setStatus(doc ? 'draw, then Save' : 'empty canvas: draw anything, then Save')
        setEditor(ed)
      })()
    },
    [figureId],
  )

  const save = async () => {
    if (!editor) return
    setBusy(true)
    try {
      const baked = await bake(editor, figureId)
      const { document } = editor.getSnapshot()
      await saveContentFile(docPath(figureId), JSON.stringify(document))
      await saveContentFile(`figures/${figureId}.json`, JSON.stringify(baked, null, 2))
      await onSaved?.()
      onClose()
    } catch (err) {
      setStatus(`could not save: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="mn-diagram-editor" role="dialog" aria-label={`Edit drawing ${figureId}`}>
      <div className="mn-diagram-editor-bar">
        <strong>{figureId}</strong>
        <span className="mn-diagram-editor-status">{status}</span>
        <span style={{ flex: 1 }} />
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
