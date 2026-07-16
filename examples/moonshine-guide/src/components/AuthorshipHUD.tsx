import { useEffect, useState } from 'react'
import { useFeedback } from '../lib/FeedbackContext'
import type { Comment } from '../lib/feedback'

// Bottom-right "authorship HUD": the author's view of the feedback loop.
// Comments accumulate by default — nothing is delivered to an agent until the
// author presses "Address", which writes an address request the connected
// adapter consumes (at its next turn boundary, or next listener tick). The HUD
// shows whether a harness hook is armed, offers the Address button plus an
// example prompt to nudge the chat directly, and lists sent comments with the
// agent's replies. Auto-address (the old always-listen behavior) is an
// explicit opt-in toggle.
//
// Mounted only from EditChrome (dev-only). Renders nothing when the feedback
// subsystem is disabled (flag off / routes absent).

type Status = { dot: string; label: string }

function statusOf(caps: {
  harness: string | null
  alive: boolean
  mode: string | null
  addressRequestedAt: string | null
}): Status {
  if (!caps.harness) return { dot: 'mn-dot-off', label: 'no agent connected' }
  if (caps.alive && caps.mode === 'listen')
    return { dot: 'mn-dot-live', label: 'agent · listening' }
  if (caps.addressRequestedAt)
    return { dot: 'mn-dot-paused', label: 'agent · address queued' }
  if (caps.alive && caps.mode === 'paused')
    return { dot: 'mn-dot-paused', label: 'agent · paused' }
  return { dot: 'mn-dot-armed', label: 'agent · ready' }
}

export default function AuthorshipHUD() {
  const { caps, comments, setMode, dismiss, requestAddress, hudOpen, setHudOpen } = useFeedback()
  const [busy, setBusy] = useState(false)

  if (!caps.enabled) return null

  const visible = comments.filter((c) => c.status !== 'dismissed')
  const active = visible.filter((c) => c.status === 'pending' || c.status === 'delivered')
  const resolved = visible.filter((c) => c.status === 'addressed')
  const status = statusOf(caps)
  const addressQueued = caps.addressRequestedAt !== null
  const autoOn = caps.control === 'listen'

  const run = async (fn: () => Promise<void>, what: string) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(`Could not ${what}: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mn-chrome mn-hud" role="region" aria-label="Authorship feedback">
      <button
        type="button"
        className="mn-hud-bar"
        aria-expanded={hudOpen}
        onClick={() => setHudOpen(!hudOpen)}
      >
        <span className={`mn-dot ${status.dot}`} aria-hidden />
        <span className="mn-hud-label">{status.label}</span>
        {active.length > 0 && <span className="mn-hud-badge">{active.length}</span>}
        <span className="mn-hud-caret">{hudOpen ? '▾' : '▸'}</span>
      </button>

      {hudOpen && (
        <div className="mn-hud-body">
          {active.length > 0 && (
            <AddressPanel
              count={active.length}
              queued={addressQueued}
              busy={busy}
              caps={caps}
              onAddress={() => void run(requestAddress, 'request addressing')}
            />
          )}

          <div className="mn-hud-controls">
            <label className="mn-hud-auto" title="When on, the agent picks up new comments on its own (turn boundaries + idle listener). When off, comments accumulate until you press Address.">
              <input
                type="checkbox"
                checked={autoOn}
                disabled={busy || !caps.harness}
                onChange={(e) =>
                  void run(() => setMode(e.target.checked ? 'listen' : 'accumulate'), 'update mode')
                }
              />{' '}
              auto-address new comments
            </label>
            {caps.alive && caps.mode === 'listen' && (
              <button type="button" disabled={busy} onClick={() => void run(() => setMode('paused'), 'pause')}>
                Pause
              </button>
            )}
            {caps.alive && caps.mode === 'paused' && (
              <button type="button" disabled={busy} onClick={() => void run(() => setMode('listen'), 'resume')}>
                Resume
              </button>
            )}
            {caps.alive && (
              <button type="button" disabled={busy} onClick={() => void run(() => setMode('stopped'), 'stop')}>
                Stop listener
              </button>
            )}
          </div>

          {autoOn && !caps.alive && caps.harness && (
            <p className="mn-hud-note">
              Auto is on, but no idle listener is running. Comments are picked up when the
              session is next active; start the adapter's listener for idle coverage.
            </p>
          )}

          {!caps.harness && (
            <p className="mn-hud-note">
              No agent connected yet. Comments are saved and delivered once an agent with the
              moonshine adapter takes a turn.
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

// The Address button and its post-click status. The button writes an address
// request (address.json); what happens next depends on what's connected, and
// we say so honestly instead of promising a pickup we can't guarantee (see
// FEEDBACK.md cold-start caveat). The example prompt both wakes an idle
// session and tells it exactly what to do.
function AddressPanel({
  count,
  queued,
  busy,
  caps,
  onAddress,
}: {
  count: number
  queued: boolean
  busy: boolean
  caps: { harness: string | null; alive: boolean; project: string | null }
  onAddress: () => void
}) {
  const prompt = `address my moonshine comments on ${caps.project ?? 'this article'}`
  return (
    <div className="mn-hud-address-panel">
      {!queued ? (
        <button type="button" className="mn-hud-address" disabled={busy} onClick={onAddress}>
          Address {count} comment{count === 1 ? '' : 's'}
        </button>
      ) : (
        <p className="mn-hud-note">
          {caps.alive
            ? 'Address requested — the listener picks these up on its next tick (~90s).'
            : caps.harness
              ? 'Address queued — the agent adapter delivers these when the authoring session next takes a turn. To have them handled right away, send that session a message:'
              : 'Address queued — delivered once an agent connects.'}
        </p>
      )}
      {caps.harness && !caps.alive && (
        <PromptHint prompt={prompt} label={queued ? undefined : 'or ask the chat directly:'} />
      )}
    </div>
  )
}

function PromptHint({ prompt, label }: { prompt: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className="mn-hud-prompt">
      {label && <span className="mn-hud-prompt-label">{label}</span>}
      <code>{prompt}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(prompt)
          setCopied(true)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
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
