import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FigureProps } from '../registry'
import { isSimActivate } from './gesture'
import './sims.css'

// A local-state simulation of the in-place prose editor (SourceEditor.tsx):
// click a block to swap it for a textarea holding its raw markdown, edit,
// and save to render it again. The real editor opens on Cmd/Ctrl+click;
// the sim takes a plain click so a reader can try it. The rail is the real
// one, in the real order: save, comment, move up and down, the key hints.
// Save and the arrows work on the two blocks here; 💬 needs the dev server
// (the feedback figure further down plays that part).

type Block = { id: string; source: string }

// Seed blocks. One MUST carry a directive so we can show that the source
// (the literal `:term[...]{...}`) is what you edit, while the render shows
// a chip.
const INITIAL_BLOCKS: Block[] = [
  {
    id: 'b1',
    source:
      'Moonshine keeps the article readable while you work. Open a paragraph and the rendered block becomes a textarea containing its exact markdown, so a small wording change can happen where you were already reading.',
  },
  {
    id: 'b2',
    source:
      'The :term[gradient]{to=field} still appears as a linked term in the article. Saving splices this source back into the file by offset, which preserves the directive and the surrounding prose without serializing the rendered HTML.',
  },
]

// Minimal renderer: turn `:term[label]{...}` into a styled chip, leave the
// rest as plain text. This is a sim, so a single regex pass is enough.
const TERM_RE = /:term\[([^\]]+)\]\{[^}]*\}/g

function renderSource(source: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  TERM_RE.lastIndex = 0
  while ((m = TERM_RE.exec(source)) !== null) {
    if (m.index > last) out.push(source.slice(last, m.index))
    out.push(
      <span
        key={`chip-${key++}`}
        style={{
          color: 'var(--accent)',
          borderBottom: '1px dotted var(--accent)',
          padding: '0 1px',
          borderRadius: '2px',
        }}
      >
        {m[1]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < source.length) out.push(source.slice(last))
  return out
}

export default function ProseEditSim(_props: FigureProps) {
  const [blocks, setBlocks] = useState<Block[]>(INITIAL_BLOCKS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Focus the textarea when an edit opens.
  useEffect(() => {
    const el = taRef.current
    if (!editingId || !el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editingId])

  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft, editingId])

  function openEdit(block: Block, e: ReactPointerEvent) {
    // Plain click only — a Cmd/Ctrl+click belongs to the real editor and
    // must pass through untouched.
    if (!isSimActivate(e)) return
    e.preventDefault()
    beginEdit(block)
  }

  function beginEdit(block: Block) {
    setEditingId(block.id)
    setDraft(block.source)
  }

  function commit() {
    if (!editingId) return
    setBlocks((bs) => bs.map((b) => (b.id === editingId ? { ...b, source: draft } : b)))
    setEditingId(null)
  }

  function cancel() {
    setEditingId(null)
  }

  function move(id: string, dir: -1 | 1) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= bs.length) return bs
      const next = bs.slice()
      const [it] = next.splice(i, 1)
      next.splice(j, 0, it)
      return next
    })
  }

  return (
    <div
      className="mn-sim prose-edit-sim"
      style={{ fontFamily: 'var(--body-font)', color: 'var(--text)' }}
    >
      <p
        className="figure-hint"
        style={{ margin: '0 0 0.75rem' }}
      >
        click a paragraph to edit its markdown · in the harness, hold Cmd/Ctrl and click
      </p>

      <div
        className="prose-edit-sim-surface"
        style={{
          background: 'var(--fig-bg)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
        }}
      >
        {blocks.map((block, idx) => {
          if (editingId === block.id) {
            return (
              <div className="mn-edit" key={block.id}>
                <textarea
                  ref={taRef}
                  className="mn-edit-textarea"
                  value={draft}
                  spellCheck={false}
                  aria-label="Markdown source of this paragraph"
                  rows={Math.max(2, draft.split('\n').length)}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      commit()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      cancel()
                    }
                  }}
                />
                <div className="mn-edit-bar">
                  <button
                    className="mn-edit-done"
                    onClick={commit}
                    aria-label="Save changes"
                    title="Save changes (⌘/Ctrl+Enter)"
                  >
                    <span aria-hidden>✓</span>
                  </button>
                  <button type="button" className="mn-edit-comment" disabled aria-label="Comment to the agent" title="Comment to the agent (dev only)">
                    💬
                  </button>
                  <div className="mn-edit-move mn-edit-move-text">
                    <button
                      onClick={() => move(block.id, -1)}
                      disabled={idx === 0}
                      aria-label="Move block up"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(block.id, 1)}
                      disabled={idx === blocks.length - 1}
                      aria-label="Move block down"
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>
                  <span className="mn-edit-hint">
                    <span>⌘↵ save</span>
                    <span>esc cancel</span>
                  </span>
                </div>
              </div>
            )
          }

          return (
            <p
              key={block.id}
              className="mn-block mn-block-armed"
              role="button"
              tabIndex={0}
              aria-label="Edit this block's markdown"
              onPointerDown={(e) => openEdit(block, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  beginEdit(block)
                }
              }}
              style={{ margin: '0 0 0.85rem', cursor: 'pointer' }}
            >
              {renderSource(block.source)}
            </p>
          )
        })}
      </div>

      <p className="figure-hint" style={{ marginTop: '0.6rem' }}>
        the second paragraph holds a <code style={{ fontFamily: 'var(--mono-font)' }}>:term[…]{'{…}'}</code>{' '}
        directive: open it to see the link as it is written in the file
      </p>
    </div>
  )
}
