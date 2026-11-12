import { useState } from 'react'
import { useEdit } from '../lib/EditContext'
import { useFeedback } from '../lib/FeedbackContext'
import { locate, wordDiff, type Suggestion } from '../lib/suggestions'

// Dev-only cards for an agent's suggestions, shown under the top-level block
// they refer to while the HUD's suggestions toggle is on. Each card shows the
// proposed change as a word diff with the agent's reason, and three verdicts:
// accept (apply as proposed), edit (change the proposal, then apply), reject.
// Applying goes through the same conflict-checked, undoable, auto-committed
// save as every other in-page edit.

type Props = { start: number; end: number }

export default function SuggestionCards({ start, end }: Props) {
  const { body, path } = useEdit()
  const { caps, suggestions, showSuggestions } = useFeedback()
  if (!caps.enabled || !showSuggestions) return null
  const here = suggestions.flatMap((s) => {
    if (s.status !== 'open' || s.path !== path) return []
    const range = locate(s, body)
    if (!range || range[0] < start || range[0] >= end) return []
    return [{ s, range }]
  })
  if (here.length === 0) return null
  return (
    <div className="mn-chrome mn-sg-stack">
      {here.map(({ s, range }) => (
        <SuggestionCard key={s.id} s={s} range={range} />
      ))}
    </div>
  )
}

function SuggestionCard({ s, range }: { s: Suggestion; range: [number, number] }) {
  const { replaceRanges } = useEdit()
  const { decideSuggestion } = useFeedback()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.replace ?? s.find)
  const [busy, setBusy] = useState(false)
  const hasChange = typeof s.replace === 'string'

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(false)
    }
  }

  const apply = (text: string, edited: boolean) =>
    run(async () => {
      if (text !== s.find) {
        await replaceRanges(
          [{ start: range[0], end: range[1], text }],
          `suggestion ${s.id} ${edited ? 'edited' : 'accepted'}`,
        )
      }
      await decideSuggestion(s.id, 'accepted', edited ? text : undefined)
    })

  return (
    <div className="mn-sg" id={`mn-sg-${s.id}`}>
      <div className="mn-sg-head">
        <span>{hasChange ? 'suggested change' : 'remark'}</span>
        {s.source && <span className="mn-sg-source">{s.source}</span>}
      </div>

      {editing ? (
        <textarea
          className="mn-sg-edit"
          value={draft}
          autoFocus
          rows={Math.min(14, Math.max(3, Math.ceil(draft.length / 70) + draft.split('\n').length))}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
              setDraft(s.replace ?? s.find)
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void apply(draft, draft !== s.replace)
            }
          }}
        />
      ) : hasChange ? (
        <p className="mn-sg-diff">
          {s.replace === '' ? (
            <del>{s.find}</del>
          ) : (
            wordDiff(s.find, s.replace as string).map((part, i) =>
              part.kind === 'same' ? (
                <span key={i}>{part.text}</span>
              ) : part.kind === 'del' ? (
                <del key={i}>{part.text}</del>
              ) : (
                <ins key={i}>{part.text}</ins>
              ),
            )
          )}
        </p>
      ) : (
        <p className="mn-sg-diff mn-sg-quote">{s.find}</p>
      )}

      {s.note && <p className="mn-sg-note">{s.note}</p>}

      <div className="mn-sg-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="mn-sg-primary"
              disabled={busy}
              onClick={() => void apply(draft, draft !== s.replace)}
            >
              Apply
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setDraft(s.replace ?? s.find)
              }}
            >
              Cancel
            </button>
            <span className="mn-sg-keys">⌘/Ctrl+Enter applies · Esc cancels</span>
          </>
        ) : (
          <>
            {hasChange && (
              <button
                type="button"
                className="mn-sg-primary"
                disabled={busy}
                onClick={() => void apply(s.replace as string, false)}
              >
                Accept
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setEditing(true)}>
              {hasChange ? 'Edit' : 'Edit passage'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => decideSuggestion(s.id, 'rejected'))}
            >
              {hasChange ? 'Reject' : 'Dismiss'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
