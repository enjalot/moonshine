import { useEffect, useRef, useState } from 'react'
import type { FigureProps } from '../registry'
import './sims.css'

// A local-state simulation of the authorship-feedback loop (the protocol
// in plugins/moonshine/FEEDBACK.md). The real thing: in dev the author
// presses 💬 on an open prose editor or a figure's knob panel, types a
// comment, and the dev server writes it as one JSON file under
// .feedback/. Comments accumulate. When the author presses Address in the
// HUD, the dev server writes address.json; the Claude Code Stop hook finds
// it the next time the authoring session ends a turn, claims the pending
// comments (pending → delivered), deletes the request and hands them to
// the session, which edits the article and writes a one-line reply into
// the comment's own file.
//
// The sim walks one comment through that: compose → pending → Address
// queued → delivered → addressed. The record has the real fields, and the
// HUD uses the real labels (AuthorshipHUD.tsx). Deterministic: fixed id,
// times and text. With reduced motion the timed steps happen at once.
// No network, no files.

type Stage = 'idle' | 'composing' | 'pending' | 'queued' | 'delivered' | 'addressed'

const FB_ID = 'fb_mc3k9q2a_k3f2x1'
const COMMENT = 'too hand-wavy: how often does the listener check for comments?'
const REPLY = 'said the listener ticks every 90 seconds'
const EXCERPT = 'The agent picks comments up while it works.'

const T_PENDING = '2026-07-01T18:30:02Z'
const T_REQUESTED = '2026-07-01T18:34:30Z'
const T_DELIVERED = '2026-07-01T18:34:41Z'
const T_ADDRESSED = '2026-07-01T18:35:07Z'

const statusOf = (stage: Stage) => (stage === 'delivered' ? 'delivered' : stage === 'addressed' ? 'addressed' : 'pending')

// The comment file, with the lines that changed at this stage marked.
function record(stage: Stage): { text: string; changed: boolean }[] {
  const waiting = stage === 'pending' || stage === 'queued'
  const done = stage === 'addressed'
  return [
    { text: '{', changed: false },
    { text: `  "id": "${FB_ID}",`, changed: false },
    { text: `  "ts": "${T_PENDING}",`, changed: false },
    { text: '  "project": "moonshine-guide",', changed: false },
    { text: `  "status": "${statusOf(stage)}",`, changed: !waiting },
    { text: '  "target": {', changed: false },
    { text: '    "kind": "block",', changed: false },
    { text: '    "path": "guide.md",', changed: false },
    { text: '    "range": [5120, 5163],', changed: false },
    { text: `    "excerpt": "${EXCERPT}",`, changed: false },
    { text: '    "anchorHash": "a3f9c0"', changed: false },
    { text: '  },', changed: false },
    { text: `  "comment": "${COMMENT}",`, changed: false },
    { text: `  "reply": ${done ? `"${REPLY}"` : 'null'},`, changed: done },
    { text: `  "deliveredAt": ${waiting ? 'null' : `"${T_DELIVERED}"`},`, changed: stage === 'delivered' },
    { text: `  "addressedAt": ${done ? `"${T_ADDRESSED}"` : 'null'}`, changed: done },
    { text: '}', changed: false },
  ]
}

export default function FeedbackSim(_props: FigureProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((id) => clearTimeout(id)), [])

  function later(fn: () => void, ms: number) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fn()
      return
    }
    timers.current.push(window.setTimeout(fn, ms))
  }

  // Address only writes the request. The adapter does the rest when the
  // authoring session next reaches a turn boundary.
  function address() {
    setStage('queued')
    later(() => setStage('delivered'), 1800)
    later(() => setStage('addressed'), 4200)
  }

  function reset() {
    timers.current.forEach((id) => clearTimeout(id))
    timers.current = []
    setStage('idle')
  }

  const sent = stage !== 'idle' && stage !== 'composing'
  const open = stage === 'pending' || stage === 'queued' || stage === 'delivered'

  return (
    <div className="mn-sim mn-fb-sim">
      <p className="figure-hint">
        {stage === 'idle'
          ? 'press 💬 on the open editor'
          : stage === 'composing'
            ? 'send the comment'
            : stage === 'pending'
              ? 'the comment waits in its file. Press Address in the HUD'
              : stage === 'addressed'
                ? 'the reply is in the file and in the HUD'
                : 'watch the status change in the file'}
      </p>

      <div className="mn-fb-grid">
        {/* The author's side: an open editor, then the comment box. */}
        <div className="mn-fb-pane mn-fb-author">
          <div className="mn-sim-pane-name">Author · browser</div>
          <div className="mn-fb-editor">
            <div className="mn-fb-source">{EXCERPT}</div>
            <button
              type="button"
              className="mn-fb-bubble"
              aria-label="Comment to the agent"
              title="Comment to the agent"
              disabled={stage !== 'idle'}
              onClick={() => setStage('composing')}
            >
              💬
            </button>
          </div>
          {stage === 'composing' && (
            <div className="mn-fb-box" role="group" aria-label="Comment to the agent">
              <div>
                Comment on <strong>this passage</strong>
              </div>
              <p className="mn-fb-typed">{COMMENT}</p>
              <button type="button" onClick={() => setStage('pending')}>
                Send
              </button>
            </div>
          )}

          {/* The HUD, as it sits in the corner of the page in dev. */}
          <div className="mn-fb-hud" role="group" aria-label="Simulated authorship HUD">
            <div className="mn-fb-hud-bar">
              <span className="mn-fb-dot" data-on={stage === 'queued' ? 'queued' : undefined} aria-hidden />
              <span>{stage === 'queued' ? 'agent · address queued' : 'agent · ready'}</span>
              {open && <span className="mn-fb-badge">1</span>}
            </div>
            {stage === 'pending' && (
              <button type="button" className="mn-fb-address" onClick={address}>
                Address 1 comment
              </button>
            )}
            {stage === 'queued' && <p className="mn-fb-note">Address queued: delivered when the authoring session next takes a turn.</p>}
            {sent ? (
              <div className="mn-fb-item" aria-live="polite">
                <div className="mn-fb-item-head">{stage === 'addressed' ? 'Addressed (1)' : 'Open (1)'} · block</div>
                <p>{COMMENT}</p>
                {stage === 'delivered' && <span className="mn-fb-tag">picked up…</span>}
                {stage === 'addressed' && <p className="mn-fb-reply">↳ {REPLY}</p>}
              </div>
            ) : (
              <p className="mn-fb-note">No comments yet.</p>
            )}
            {stage === 'addressed' && (
              <button type="button" onClick={reset}>
                Start over
              </button>
            )}
          </div>
        </div>

        {/* The inbox: one file per comment, rewritten in place. */}
        <div className="mn-fb-pane mn-fb-file">
          <div className="mn-sim-pane-name">.feedback/{sent ? `${FB_ID}.json` : ''}</div>
          {sent ? (
            <pre className="mn-sim-code" aria-live="polite">
              {record(stage).map((l, i) => (
                <span key={i} data-on={l.changed ? 'changed' : undefined}>
                  {l.text + '\n'}
                </span>
              ))}
            </pre>
          ) : (
            <pre className="mn-sim-code">
              <span className="mn-sim-dim">(empty)</span>
            </pre>
          )}
          {stage === 'queued' && (
            <>
              <div className="mn-sim-pane-name">.feedback/address.json</div>
              <pre className="mn-sim-code">
                <span data-on="changed">{`{ "requestedAt": "${T_REQUESTED}",\n  "sessionId": "8b1f6a2e-…" }`}</span>
              </pre>
            </>
          )}
        </div>

        {/* The agent's side. */}
        <div className="mn-fb-pane mn-fb-agent">
          <div className="mn-sim-pane-name">Agent · authoring session</div>
          <ol className="mn-fb-steps" aria-live="polite">
            {!sent && <li>working on its own turn</li>}
            {stage === 'pending' && <li>not told: comments wait until the author asks</li>}
            {stage === 'queued' && <li>still mid-turn. The Stop hook runs when the turn ends</li>}
            {(stage === 'delivered' || stage === 'addressed') && (
              <li data-on={stage === 'delivered' ? 'now' : undefined}>
                Stop hook finds address.json, claims the comment, deletes the request and keeps the turn going
              </li>
            )}
            {stage === 'addressed' && <li data-on="now">edits content/guide.md, then writes reply and addressedAt into the comment file</li>}
          </ol>
        </div>
      </div>
    </div>
  )
}
