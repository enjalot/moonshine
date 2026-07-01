import { useEffect, useRef, useState } from 'react'
import { useFeedback } from '../lib/FeedbackContext'

// Floating composer for a single comment. Opened from an edit-mode panel
// (a prose block's source editor or a figure's knob panel) via
// startComment(target); it floats above the authorship HUD rather than
// nesting inside the article DOM, so it never lands invalid markup inside a
// <p> or <li>. Sends the typed comment to the .feedback/ inbox for whatever
// harness is listening.

function targetLabel(kind: string): string {
  switch (kind) {
    case 'block':
      return 'this passage'
    case 'caption':
      return 'this caption'
    case 'figure':
      return 'this figure'
    case 'term':
      return 'this term'
    case 'selection':
      return 'this selection'
    default:
      return 'this'
  }
}

export default function CommentBox() {
  const { draftTarget, cancelComment, submitComment } = useFeedback()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset and focus whenever a new target opens the box.
  useEffect(() => {
    if (draftTarget) {
      setText('')
      setBusy(false)
      // focus after paint
      const id = window.setTimeout(() => ref.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [draftTarget])

  if (!draftTarget) return null

  const excerpt = draftTarget.excerpt?.trim().replace(/\s+/g, ' ')
  const send = async () => {
    if (busy || !text.trim()) return
    setBusy(true)
    try {
      await submitComment(text)
      setText('')
    } catch (err) {
      setBusy(false)
      // eslint-disable-next-line no-alert
      window.alert(`Could not send comment: ${String(err)}`)
    }
  }

  return (
    <div className="mn-chrome mn-comment-box" role="dialog" aria-label="Comment to the agent">
      <div className="mn-comment-box-head">
        <span>
          Comment on{' '}
          <strong>
            {targetLabel(draftTarget.kind)}
            {draftTarget.figureId ? ` (${draftTarget.figureId})` : ''}
          </strong>
        </span>
        <button type="button" aria-label="Close comment box" onClick={cancelComment}>
          ×
        </button>
      </div>
      {excerpt && (
        <p className="mn-comment-excerpt" title={excerpt}>
          {excerpt.length > 140 ? `${excerpt.slice(0, 140)}…` : excerpt}
        </p>
      )}
      <textarea
        ref={ref}
        className="mn-comment-textarea"
        value={text}
        placeholder="What should the agent change here?"
        spellCheck
        disabled={busy}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void send()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancelComment()
          }
        }}
      />
      <div className="mn-comment-actions">
        <span className="mn-comment-hint">⌘↵ send · esc cancel</span>
        <button type="button" disabled={busy || !text.trim()} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
