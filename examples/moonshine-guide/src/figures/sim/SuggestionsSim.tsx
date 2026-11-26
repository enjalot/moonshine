import { useState } from 'react'
import { wordDiff } from '../../lib/suggestions'
import type { FigureProps } from '../registry'
import './sims.css'

// A local-state simulation of agent suggestions (FEEDBACK.md § Suggestions).
// The real thing: after an editing pass or critique, an agent writes records
// under .feedback/suggestions/<id>.json via scripts/suggest.mjs. In dev, each
// open suggestion renders under its block as a word-diff card (Accept, Edit,
// Reject) or as a remark with no replacement (Edit passage, Send to agent,
// Dismiss). Applying writes into the markdown through the same conflict-checked,
// auto-committing save path as manual edits, and records the verdict (plus any
// edited appliedText) so the agent can read the author's taste with --list.
//
// Deterministic, no network, no files.

type Verdict = 'open' | 'accepted' | 'rejected' | 'sent'

type SimSuggestion = {
  id: string
  ts: string
  path: string
  find: string
  replace?: string
  note: string
  source: string
}

const INITIAL_PASSAGE =
  'The renderer produces a crisp, fast, and compelling view of the loss surface — every frame stays under 16 ms.'

const SUGGESTIONS: SimSuggestion[] = [
  {
    id: 'sg_mwdua1wf_001',
    ts: '2026-11-12T17:46:02Z',
    path: 'guide.md',
    find: 'a crisp, fast, and compelling view of the loss surface — every',
    replace: 'a view of the loss surface, and every',
    note: 'Triadic adjective stack and an em dash.',
    source: 'editing pass',
  },
  {
    id: 'sg_mwdua1wf_002',
    ts: '2026-11-12T17:46:03Z',
    path: 'guide.md',
    find: 'every frame stays under 16 ms',
    note: 'No timing measurement in the figure code. Measure it, or drop the number.',
    source: 'critique',
  },
]

const T_RESOLVED = '2026-11-12T17:48:19Z'

type ItemState = {
  status: Verdict
  appliedText?: string
  sentMessage?: string
}

const initialItems = (): Record<string, ItemState> => ({
  [SUGGESTIONS[0].id]: { status: 'open' },
  [SUGGESTIONS[1].id]: { status: 'open' },
})

function formatRecord(s: SimSuggestion, st: ItemState): { text: string; changed: boolean }[] {
  const lines: { text: string; changed: boolean }[] = [
    { text: '{', changed: false },
    { text: `  "id": "${s.id}",`, changed: false },
    { text: `  "ts": "${s.ts}",`, changed: false },
    { text: `  "status": "${st.status}",`, changed: st.status !== 'open' },
    { text: `  "path": "${s.path}",`, changed: false },
    { text: `  "find": ${JSON.stringify(s.find)},`, changed: false },
  ]
  if (typeof s.replace === 'string') {
    lines.push({ text: `  "replace": ${JSON.stringify(s.replace)},`, changed: false })
  }
  lines.push({ text: `  "note": ${JSON.stringify(s.note)},`, changed: false })
  lines.push({ text: `  "source": ${JSON.stringify(s.source)},`, changed: false })
  if (st.appliedText !== undefined) {
    lines.push({ text: `  "appliedText": ${JSON.stringify(st.appliedText)},`, changed: true })
  }
  lines.push({
    text: `  "resolvedAt": ${st.status === 'open' ? 'null' : `"${T_RESOLVED}"`}`,
    changed: st.status !== 'open',
  })
  lines.push({ text: '}', changed: false })
  return lines
}

export default function SuggestionsSim(_props: FigureProps) {
  const [passage, setPassage] = useState(INITIAL_PASSAGE)
  const [changedSpan, setChangedSpan] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, ItemState>>(initialItems)
  const [showCards, setShowCards] = useState(true)
  const [activeId, setActiveId] = useState(SUGGESTIONS[0].id)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const openCount = SUGGESTIONS.filter((s) => items[s.id].status === 'open').length
  const anyResolved = openCount < SUGGESTIONS.length

  function applyReplacement(s: SimSuggestion, nextText: string, edited: boolean) {
    setPassage((cur) => (cur.includes(s.find) ? cur.replace(s.find, nextText) : cur))
    setChangedSpan(nextText)
    setItems((cur) => ({
      ...cur,
      [s.id]: { status: 'accepted', appliedText: edited ? nextText : undefined },
    }))
    setActiveId(s.id)
    setEditingId(null)
  }

  function rejectItem(s: SimSuggestion) {
    setItems((cur) => ({ ...cur, [s.id]: { status: 'rejected' } }))
    setActiveId(s.id)
    setEditingId(null)
    setSendingId(null)
  }

  function sendRemark(s: SimSuggestion, text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setItems((cur) => ({ ...cur, [s.id]: { status: 'sent', sentMessage: trimmed } }))
    setActiveId(s.id)
    setSendingId(null)
  }

  function reset() {
    setPassage(INITIAL_PASSAGE)
    setChangedSpan(null)
    setItems(initialItems())
    setShowCards(true)
    setActiveId(SUGGESTIONS[0].id)
    setEditingId(null)
    setSendingId(null)
  }

  const activeSuggestion = SUGGESTIONS.find((s) => s.id === activeId) ?? SUGGESTIONS[0]
  const activeState = items[activeSuggestion.id]

  // Split passage so the just-applied text highlights in the markdown pane.
  const highlightIdx = changedSpan ? passage.indexOf(changedSpan) : -1

  return (
    <div className="mn-sim mn-sg-sim">
      <p className="figure-hint">
        {openCount > 0
          ? 'accept, edit, or reject the proposed rewrite, or send the remark back to the agent as a comment'
          : 'every suggestion is resolved; the agent reads your decisions before its next pass'}
      </p>

      <div className="mn-sim-split">
        {/* Author's view: passage + HUD switch + suggestion cards. */}
        <div>
          <div className="mn-sg-sim-bar">
            <span className="mn-sim-pane-name">Author · browser</span>
            <button
              type="button"
              className="mn-sg-sim-toggle"
              role="switch"
              aria-checked={showCards}
              onClick={() => setShowCards((v) => !v)}
            >
              {showCards ? 'Hide' : 'Show'} {openCount} open suggestion{openCount === 1 ? '' : 's'}
            </button>
          </div>

          <div className="mn-sg-sim-passage" aria-live="polite">
            {passage}
          </div>

          {showCards && (
            <div className="mn-sg-stack">
              {SUGGESTIONS.map((s) => {
                const st = items[s.id]
                if (st.status !== 'open') return null
                const hasChange = typeof s.replace === 'string'
                const isEditing = editingId === s.id
                const isSending = sendingId === s.id
                return (
                  <div
                    key={s.id}
                    className="mn-sg"
                    onClick={() => setActiveId(s.id)}
                  >
                    <div className="mn-sg-head">
                      <span>{hasChange ? 'suggested change' : 'remark'}</span>
                      <span className="mn-sg-source">{s.source}</span>
                    </div>

                    {isEditing ? (
                      <textarea
                        className="mn-sg-edit"
                        aria-label="Edit proposed replacement"
                        value={draft}
                        rows={3}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                    ) : hasChange ? (
                      <p className="mn-sg-diff">
                        {wordDiff(s.find, s.replace as string).map((part, i) =>
                          part.kind === 'same' ? (
                            <span key={i}>{part.text}</span>
                          ) : part.kind === 'del' ? (
                            <del key={i}>{part.text}</del>
                          ) : (
                            <ins key={i}>{part.text}</ins>
                          ),
                        )}
                      </p>
                    ) : (
                      <p className="mn-sg-diff mn-sg-quote">{s.find}</p>
                    )}

                    {!isSending && <p className="mn-sg-note">{s.note}</p>}

                    {isSending && (
                      <textarea
                        className="mn-sg-edit mn-sg-message"
                        aria-label="Message to the agent"
                        value={message}
                        rows={3}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                    )}

                    <div className="mn-sg-actions">
                      {isSending ? (
                        <>
                          <button
                            type="button"
                            className="mn-sg-primary"
                            disabled={!message.trim()}
                            onClick={() => sendRemark(s, message)}
                          >
                            Send
                          </button>
                          <button type="button" onClick={() => setSendingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : isEditing ? (
                        <>
                          <button
                            type="button"
                            className="mn-sg-primary"
                            onClick={() => applyReplacement(s, draft, draft !== s.replace)}
                          >
                            Apply
                          </button>
                          <button type="button" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {hasChange && (
                            <button
                              type="button"
                              className="mn-sg-primary"
                              onClick={() => applyReplacement(s, s.replace as string, false)}
                            >
                              Accept
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(s.id)
                              setSendingId(null)
                              setDraft(s.replace ?? s.find)
                              setActiveId(s.id)
                            }}
                          >
                            {hasChange ? 'Edit' : 'Edit passage'}
                          </button>
                          {!hasChange && (
                            <button
                              type="button"
                              onClick={() => {
                                setSendingId(s.id)
                                setEditingId(null)
                                setMessage(s.note)
                                setActiveId(s.id)
                              }}
                            >
                              Send to agent
                            </button>
                          )}
                          <button type="button" onClick={() => rejectItem(s)}>
                            {hasChange ? 'Reject' : 'Dismiss'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {anyResolved && (
            <div className="mn-sg-sim-resolved">
              {SUGGESTIONS.filter((s) => items[s.id].status !== 'open').map((s) => {
                const st = items[s.id]
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="mn-sg-sim-chip"
                    data-on={activeId === s.id ? 'active' : undefined}
                    onClick={() => setActiveId(s.id)}
                  >
                    {s.source}: {st.status}
                    {st.appliedText ? ' (edited)' : ''}
                  </button>
                )
              })}
              <button type="button" className="mn-sg-sim-reset" onClick={reset}>
                Start over
              </button>
            </div>
          )}
        </div>

        {/* Disk view: updated markdown + suggestion JSON record. */}
        <div>
          <div className="mn-sim-pane-name">content/guide.md</div>
          <pre className="mn-sim-code" aria-live="polite">
            {highlightIdx >= 0 && changedSpan ? (
              <>
                {passage.slice(0, highlightIdx)}
                <span data-on="changed">{changedSpan}</span>
                {passage.slice(highlightIdx + changedSpan.length)}
              </>
            ) : (
              passage
            )}
          </pre>

          <div className="mn-sim-pane-name mn-sg-sim-file-label">
            .feedback/suggestions/{activeSuggestion.id}.json
          </div>
          <pre className="mn-sim-code" aria-live="polite">
            {formatRecord(activeSuggestion, activeState).map((l, i) => (
              <span key={i} data-on={l.changed ? 'changed' : undefined}>
                {l.text + '\n'}
              </span>
            ))}
          </pre>

          {activeState.status === 'sent' && activeState.sentMessage && (
            <>
              <div className="mn-sim-pane-name mn-sg-sim-file-label">
                .feedback/fb_from_remark.json
              </div>
              <pre className="mn-sim-code">
                <span data-on="changed">
                  {`{ "status": "pending",\n  "comment": ${JSON.stringify(activeState.sentMessage)} }`}
                </span>
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
