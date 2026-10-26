import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { EDIT_ENABLED, uploadImage, useEdit } from '../lib/EditContext'
import { place, type Placement } from '../figures/diagram/layout'
import type { DiagramSpec } from '../figures/diagram/spec'
import SourceEditor from './SourceEditor'

// Dev-only, notebook-style "+" between top-level blocks. Hovering the gap
// between two blocks (or after the last) shows a "+"; it inserts
//
//   Text     a markdown block, written in place
//   Diagram  boxes and arrows in the arrange editor →
//            `:::figure{id=diagram-N kind=diagram}` (spec + arrangement in
//            content/figures/diagram-N.json)
//   Image    an upload to public/media/ → `![alt](media/name.png)`
//
// Everything lands in the markdown through the normal save path (conflict
// check, undo, moonshine-edit commit), so the agent sees it like any other
// author edit, and 💬 comments on the new block ask the agent to adjust it.
//
// Rendered into <body>, not the article: the article's children must stay
// 1:1 with markdown blocks (see BlockReorderLayer). Returns null in
// production before any hooks, so the whole layer is tree-shaken.

const DiagramArrange = import.meta.env.DEV ? lazy(() => import('../figures/diagram/DiagramArrange')) : null

// What a new diagram starts as: two boxes and an arrow to edit.
const STARTER: DiagramSpec = {
  direction: 'RIGHT',
  nodes: [
    { id: 'n1', label: 'Input' },
    { id: 'n2', label: 'Output' },
  ],
  edges: [{ from: 'n1', to: 'n2' }],
}

type Props = { containerRef: RefObject<HTMLElement | null> }

export default function InsertLayer(props: Props) {
  if (!EDIT_ENABLED) return null
  return <Layer {...props} />
}

function blockEls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'header' || tag === 'footer') return false
    if (el.hasAttribute('data-footnotes')) return false
    return !(el.classList.contains('mn-chrome') || el.classList.contains('mn-drop-indicator'))
  }) as HTMLElement[]
}

type Gap = { index: number; top: number; left: number; width: number }
type Mode = null | 'menu' | 'text' | 'diagram' | 'uploading'

function Layer({ containerRef }: Props) {
  const { armed, activeRange, blocks, body, insertBlock } = useEdit()
  const [gap, setGap] = useState<Gap | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [error, setError] = useState<string | null>(null)
  const [diagram, setDiagram] = useState<{ id: string; placement: Placement } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const busy = armed || Boolean(activeRange)

  // Track the gap under the pointer (frozen while a menu/composer is open).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (modeRef.current) return
      const container = containerRef.current
      if (!container || busy) return setGap(null)
      const els = blockEls(container)
      if (!els.length || els.length !== blocks.length) return setGap(null)
      const c = container.getBoundingClientRect()
      if (e.clientX < c.left - 48 || e.clientX > c.right + 16) return setGap(null)
      const rects = els.map((el) => el.getBoundingClientRect())
      const ys = rects.map((r, i) => (i === 0 ? r.top - 6 : (rects[i - 1].bottom + r.top) / 2))
      ys.push(rects[rects.length - 1].bottom + 10)
      let best = -1
      for (let i = 0; i < ys.length; i++) {
        if (Math.abs(e.clientY - ys[i]) < 14 && (best < 0 || Math.abs(e.clientY - ys[i]) < Math.abs(e.clientY - ys[best]))) best = i
      }
      if (best < 0) return setGap(null)
      const ref = rects[Math.min(best, rects.length - 1)]
      setGap({ index: best, top: ys[best] + window.scrollY, left: ref.left + window.scrollX, width: ref.width })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [containerRef, blocks.length, busy])

  // While composing text, push the following block down so the composer
  // doesn't cover it (margin on the next element, restored on close).
  useLayoutEffect(() => {
    if (mode !== 'text' || !gap) return
    const container = containerRef.current
    const composer = composerRef.current
    if (!container || !composer) return
    const els = blockEls(container)
    const target: HTMLElement = els[gap.index] ?? container
    const prop = els[gap.index] ? 'marginTop' : 'paddingBottom'
    const prev = target.style[prop]
    const apply = () => {
      target.style[prop] = `${composer.offsetHeight + 24}px`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(composer)
    return () => {
      ro.disconnect()
      target.style[prop] = prev
    }
  }, [mode, gap, containerRef])

  const close = () => {
    setMode(null)
    setError(null)
    setGap(null)
  }

  const openDiagram = async () => {
    let i = 1
    while (body.includes(`id=diagram-${i}`)) i++
    setDiagram({ id: `diagram-${i}`, placement: await place(STARTER, null) })
    setMode('diagram')
  }

  const onImage = async (file: File | undefined) => {
    if (!file || !gap) return
    setMode('uploading')
    try {
      const path = await uploadImage(file)
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'image'
      await insertBlock(gap.index, `![${alt}](${path})`)
      close()
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      setMode('menu')
    }
  }

  if (!gap) return null

  return createPortal(
    <div className="mn-chrome mn-insert" style={{ top: gap.top, left: gap.left, width: gap.width }}>
      {mode !== 'text' && (
        <div className="mn-insert-rail">
          <button
            type="button"
            className="mn-insert-plus"
            aria-label="Insert a block here"
            aria-expanded={mode === 'menu'}
            title="Insert text, a diagram, or an image here"
            onClick={() => setMode((m) => (m ? null : 'menu'))}
          >
            +
          </button>
          {mode === 'menu' && (
            <span className="mn-insert-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => setMode('text')}>
                Text
              </button>
              <button type="button" role="menuitem" onClick={() => void openDiagram()}>
                Diagram
              </button>
              <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
                Image
              </button>
              <button type="button" aria-label="Close" onClick={close}>
                ×
              </button>
              {error && <span className="mn-insert-error">{error}</span>}
            </span>
          )}
          {mode === 'uploading' && <span className="mn-insert-menu">uploading…</span>}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            hidden
            onChange={(e) => void onImage(e.target.files?.[0])}
          />
        </div>
      )}
      {mode === 'text' && (
        <div ref={composerRef} className="mn-insert-composer">
          <SourceEditor
            variant="block"
            initialValue=""
            onCommit={async (text) => {
              await insertBlock(gap.index, text)
              close()
            }}
            onCancel={close}
          />
        </div>
      )}
      {mode === 'diagram' && diagram && DiagramArrange && (
        <Suspense fallback={<span className="mn-insert-menu">loading editor…</span>}>
          <DiagramArrange
            figureId={diagram.id}
            spec={STARTER}
            baked={null}
            placement={diagram.placement}
            authored
            onClose={close}
            onSaved={() => insertBlock(gap.index, `:::figure{id=${diagram.id} kind=diagram}\n:::`)}
          />
        </Suspense>
      )}
    </div>,
    document.body,
  )
}
