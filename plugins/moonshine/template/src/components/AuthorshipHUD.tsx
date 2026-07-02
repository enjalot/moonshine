import { useState } from 'react'
import { useFeedback } from '../lib/FeedbackContext'
import type { Comment, ListenMode } from '../lib/feedback'

// Bottom-right "authorship HUD": the author's view of the feedback loop.
// Shows whether an agent harness is connected and listening, lets the author
// start/pause/stop the listener, and lists the comments they've sent along
// with the agent's replies. Reads everything from the polled capabilities +
// comment list; writes go through the same .feedback/ protocol.
//
// Mounted only from EditChrome (dev-only). Renders nothing when the feedback
// subsystem is disabled (flag off / routes absent).

type Status = { dot: string; label: string }

function statusOf(harness: string | null, alive: boolean, mode: ListenMode | null): Status {
  if (!harness) return { dot: 'mn-dot-off', label: 'no agent connected' }
  if (alive && mode === 'listen') return { dot: 'mn-dot-live', label: `${harness} · listening` }
  if (alive && mode === 'paused') return { dot: 'mn-dot-paused', label: `${harness} · paused` }
  return { dot: 'mn-dot-off', label: `${harness} · off` }
}

export default function AuthorshipHUD() {
  const { caps, comments, setMode, dismiss } = useFeedback()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!caps.enabled) return null

  const visible = comments.filter((c) => c.status !== 'dismissed')
  const active = visible.filter((c) => c.status === 'pending' || c.status === 'delivered')
  const resolved = visible.filter((c) => c.status === 'addressed')
  const status = statusOf(caps.harness, caps.alive, caps.mode)

  const control = async (mode: ListenMode) => {
    setBusy(true)
    try {
      await setMode(mode)
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(`Could not update listener: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  // Which control buttons make sense given the current state.
  const controls = (() => {
    if (!caps.harness) return null
    if (caps.alive && caps.mode === 'listen') {
      return (
        <>
          <button type="button" disabled={busy} onClick={() => void control('paused')}>
            Pause
          </button>
          <button type="button" disabled={busy} onClick={() => void control('stopped')}>
            Stop
          </button>
        </>
      )
    }
    if (caps.alive && caps.mode === 'paused') {
      return (
        <>
          <button type="button" disabled={busy} onClick={() => void control('listen')}>
            Resume
          </button>
          <button type="button" disabled={busy} onClick={() => void control('stopped')}>
            Stop
          </button>
        </>
      )
    }
    // Adapter installed but no live listener — Start is opportunistic (see
    // FEEDBACK.md cold-start caveat); we say so rather than promise it.
    return (
      <button type="button" disabled={busy} onClick={() => void control('listen')}>
        Start listening
      </button>
    )
  })()

  return (
    <div className="mn-chrome mn-hud" role="region" aria-label="Authorship feedback">
      <button
        type="button"
        className="mn-hud-bar"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`mn-dot ${status.dot}`} aria-hidden />
        <span className="mn-hud-label">{status.label}</span>
        {active.length > 0 && <span className="mn-hud-badge">{active.length}</span>}
        <span className="mn-hud-caret">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mn-hud-body">
          <div className="mn-hud-controls">
            {controls ?? (
              <span className="mn-hud-note">
                Comments are saved and will be picked up when an agent connects.
              </span>
            )}
          </div>

          {caps.harness && !caps.alive && (
            <p className="mn-hud-note">
              No live listener. Click Start while the session is active, or run{' '}
              <code>/moonshine:moonshine-listen</code> in an idle session.
            </p>
          )}

          {active.length > 0 && (
            <>
              <h4 className="mn-hud-section">Open ({active.length})</h4>
              <ul className="mn-hud-list">
                {active.map((c) => (
                  <CommentRow key={c.id} c={c} onDismiss={() => void dismiss(c.id)} />
                ))}
              </ul>
            </>
          )}

          {resolved.length > 0 && (
            <>
              <h4 className="mn-hud-section">Addressed ({resolved.length})</h4>
              <ul className="mn-hud-list">
                {resolved.slice(0, 8).map((c) => (
                  <CommentRow key={c.id} c={c} onDismiss={() => void dismiss(c.id)} />
                ))}
              </ul>
            </>
          )}

          {visible.length === 0 && (
            <p className="mn-hud-note">
              No comments yet. Hold ⌘/Ctrl, open a passage or figure, and use 💬 to send one.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CommentRow({ c, onDismiss }: { c: Comment; onDismiss: () => void }) {
  const where = c.target.figureId ?? c.target.path
  return (
    <li className={`mn-hud-item mn-hud-item-${c.status}`}>
      <div className="mn-hud-item-head">
        <span className="mn-hud-item-where" title={where}>
          {c.target.kind}
          {c.target.figureId ? ` · ${c.target.figureId}` : ''}
        </span>
        <button type="button" aria-label="Dismiss comment" onClick={onDismiss}>
          ×
        </button>
      </div>
      <p className="mn-hud-item-text">{c.comment}</p>
      {c.reply && <p className="mn-hud-item-reply">↳ {c.reply}</p>}
      {c.status === 'delivered' && <span className="mn-hud-item-tag">picked up…</span>}
    </li>
  )
}
