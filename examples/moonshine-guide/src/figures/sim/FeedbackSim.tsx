import { useEffect, useRef, useState } from 'react'
import type { FigureProps } from '../registry'

// A pure, local-state simulation of moonshine's authorship-feedback loop
// (the protocol in plugins/moonshine/FEEDBACK.md). The real thing: in edit
// mode the author hits the 💬 button on a block's source editor or a
// figure's knob panel, types a comment, and the dev server writes it as a
// JSON file under .feedback/. Comments accumulate until the author presses
// Address (or opts into auto-address). That request is routed to the article's
// authoring session; its adapter claims the comment, and the session's
// one-line reply lands back in the same file for the HUD to show.
//
// This sim walks that lifecycle: compose → <id>.json (pending) → Address
// requested → claimed (delivered) → addressed, with the reply surfacing in a
// simulated HUD.
// Deterministic (fixed ids and timestamps), reduced-motion aware (the
// claim/address delays collapse to instant), cleanup-correct (all timers
// tracked and cleared on unmount). No network, no real files.

type Stage = 'idle' | 'composing' | 'pending' | 'queued' | 'delivered' | 'addressed'

const FB_ID = 'fb_20260701_k3f2'
const COMMENT = 'too hand-wavy: what interval does the listener tick on?'
const REPLY = 'added the 90s tick interval and named the adapter pass'
const EXCERPT = 'The agent receives the comment while it works.'

// Fixed wall-clock strings so the sim is deterministic.
const T_PENDING = '18:30:02Z'
const T_REQUESTED = '18:30:30Z'
const T_DELIVERED = '18:30:41Z'
const T_ADDRESSED = '18:31:07Z'

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--text-2)',
  delivered: 'var(--accent)',
  addressed: 'var(--accent)',
}

function recordJson(stage: Stage): string {
  if (stage === 'idle' || stage === 'composing') return ''
  const status =
    stage === 'pending' || stage === 'queued'
      ? 'pending'
      : stage === 'delivered'
        ? 'delivered'
        : 'addressed'
  const lines = [
    '{',
    `  "id": "${FB_ID}",`,
    `  "ts": "${T_PENDING}",`,
    `  "status": "${status}",`,
    '  "target": {',
    '    "kind": "block",',
    '    "path": "guide.md",',
    `    "excerpt": "${EXCERPT}"`,
    '  },',
    `  "comment": "${COMMENT}",`,
    `  "reply": ${stage === 'addressed' ? `"${REPLY}"` : 'null'},`,
    `  "deliveredAt": ${stage === 'pending' || stage === 'queued' ? 'null' : `"${T_DELIVERED}"`},`,
    `  "addressedAt": ${stage === 'addressed' ? `"${T_ADDRESSED}"` : 'null'}`,
    '}',
  ]
  return lines.join('\n')
}

const panelStyle: React.CSSProperties = {
  background: 'var(--fig-bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '0.6rem 0.75rem',
  minWidth: 0,
}

const panelTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--heading-font)',
  fontWeight: 600,
  fontSize: '0.78rem',
  color: 'var(--text-2)',
  margin: '0 0 0.45rem',
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--mono-font)',
  fontSize: '0.7rem',
  lineHeight: 1.5,
}

export default function FeedbackSim(_props: FigureProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const timeoutsRef = useRef<number[]>([])
  const reducedRef = useRef(false)

  // Respect prefers-reduced-motion: claim/address happen instantly
  // instead of on a timed sequence.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const onChange = () => {
      reducedRef.current = mq.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Clear any in-flight timers on unmount.
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id))
    }
  }, [])

  function later(fn: () => void, ms: number) {
    if (reducedRef.current) {
      fn()
      return
    }
    const id = window.setTimeout(fn, ms)
    timeoutsRef.current.push(id)
  }

  // Sending only appends a pending comment. The default is accumulation: no
  // adapter claims it until the author explicitly asks.
  function send() {
    setStage('pending')
  }

  // Address writes the one-shot request. A matching adapter consumes it on
  // its next pass, claims the comment, and hands it to the authoring session.
  function address() {
    setStage('queued')
    later(() => setStage('delivered'), 1000)
    later(() => setStage('addressed'), 2600)
  }

  function reset() {
    timeoutsRef.current.forEach((id) => clearTimeout(id))
    timeoutsRef.current = []
    setStage('idle')
  }

  const hudStatus =
    stage === 'queued'
      ? '🟡 agent · address queued · 1 open'
      : `◯ agent · ready · ${stage === 'pending' || stage === 'delivered' ? '1 open' : '0 open'}`

  return (
    <div style={{ fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      <p className="figure-hint" style={{ margin: '0 0 0.6rem' }}>
        A comment's life: the 💬 button writes a file under{' '}
        <code style={{ fontFamily: 'var(--mono-font)' }}>.feedback/</code>, the
        author asks for delivery, and the agent replies into the same file.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr)',
          gap: '0.7rem',
          alignItems: 'stretch',
        }}
      >
        {/* ── Author: the block editor with the 💬 affordance ── */}
        <div style={panelStyle}>
          <p style={panelTitleStyle}>Author (browser, edit mode)</p>
          <div
            style={{
              ...monoStyle,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '0.4rem 0.5rem',
              color: 'var(--text-2)',
            }}
          >
            {EXCERPT}
          </div>
          {stage === 'idle' ? (
            <button
              type="button"
              onClick={() => setStage('composing')}
              style={{
                marginTop: '0.5rem',
                font: 'inherit',
                fontSize: '0.78rem',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--bg)',
                cursor: 'pointer',
                padding: '0.2rem 0.55rem',
              }}
            >
              💬 comment to the agent
            </button>
          ) : (
            <div
              style={{
                marginTop: '0.5rem',
                border: '1px solid var(--accent)',
                borderRadius: 4,
                padding: '0.4rem 0.5rem',
              }}
            >
              <div style={{ ...monoStyle, color: 'var(--text)' }}>{COMMENT}</div>
              {stage === 'composing' ? (
                <button
                  type="button"
                  onClick={send}
                  style={{
                    marginTop: '0.4rem',
                    font: 'inherit',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    border: '1px solid var(--accent)',
                    borderRadius: 4,
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    cursor: 'pointer',
                    padding: '0.15rem 0.7rem',
                  }}
                >
                  Send
                </button>
              ) : (
                <div
                  style={{ ...monoStyle, marginTop: '0.3rem', color: 'var(--text-2)' }}
                >
                  sent → {FB_ID}.json
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── The inbox: one JSON file, status mutating in place ── */}
        <div style={panelStyle}>
          <p style={{ ...panelTitleStyle, fontFamily: 'var(--mono-font)' }}>
            .feedback/{stage === 'idle' || stage === 'composing' ? '' : `${FB_ID}.json`}
          </p>
          {stage === 'idle' || stage === 'composing' ? (
            <div style={{ ...monoStyle, color: 'var(--text-2)' }}>
              (empty, nothing pending)
            </div>
          ) : (
            <pre
              style={{
                ...monoStyle,
                margin: 0,
                whiteSpace: 'pre',
                overflowX: 'auto',
                color: 'var(--text)',
              }}
            >
              {recordJson(stage)}
            </pre>
          )}
          {stage === 'queued' && (
            <pre
              style={{
                ...monoStyle,
                margin: '0.55rem 0 0',
                paddingTop: '0.45rem',
                borderTop: '1px solid var(--border)',
                whiteSpace: 'pre-wrap',
                color: 'var(--accent)',
              }}
            >
              {`address.json\n{ "requestedAt": "${T_REQUESTED}",\n  "sessionId": "authoring-session" }`}
            </pre>
          )}
        </div>

        {/* ── Agent: how the record gets claimed and addressed ── */}
        <div style={panelStyle}>
          <p style={panelTitleStyle}>Agent (authoring session)</p>
          <div style={{ ...monoStyle, color: 'var(--text-2)' }}>
            {(stage === 'idle' || stage === 'composing') && <div>… working on its current turn</div>}
            {stage === 'pending' && <div>comment stays pending until the author asks</div>}
            {stage === 'queued' && (
              <>
                <div style={{ color: 'var(--text)' }}>Address routes this request here</div>
                <div>waiting for the next adapter pass…</div>
              </>
            )}
            {(stage === 'delivered' || stage === 'addressed') && (
              <>
                <div style={{ color: 'var(--text)' }}>
                  adapter: claim {FB_ID}
                </div>
                <div>pending → delivered (atomic rename)</div>
              </>
            )}
            {stage === 'addressed' && (
              <>
                <div style={{ color: 'var(--text)', marginTop: '0.3rem' }}>
                  edit content/guide.md
                </div>
                <div>reply → "{REPLY}"</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── The HUD strip: where the reply surfaces for the author ── */}
      <div
        style={{
          marginTop: '0.7rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.78rem',
          color: 'var(--text-2)',
        }}
      >
        <span
          style={{
            flex: 'none',
            whiteSpace: 'nowrap',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '0.35rem 0.9rem',
            background: 'var(--fig-bg)',
          }}
        >
          {hudStatus}
        </span>
        {stage !== 'idle' && stage !== 'composing' && (
          <span
            style={{
              ...monoStyle,
              color: STATUS_COLOR[stage] ?? 'var(--text-2)',
            }}
          >
            {stage === 'addressed'
              ? `“${COMMENT}” · ✓ ${REPLY}`
              : `“${COMMENT}” · ${stage === 'queued' ? 'pending' : stage}`}
          </span>
        )}
        {stage === 'pending' && (
          <button
            type="button"
            onClick={address}
            style={{
              marginLeft: 'auto',
              font: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid var(--accent)',
              borderRadius: 4,
              background: 'var(--accent)',
              color: 'var(--bg)',
              cursor: 'pointer',
              padding: '0.15rem 0.6rem',
            }}
          >
            Address 1 comment
          </button>
        )}
        {stage === 'addressed' && (
          <button
            type="button"
            onClick={reset}
            style={{
              marginLeft: 'auto',
              font: 'inherit',
              fontSize: '0.75rem',
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg)',
              cursor: 'pointer',
              padding: '0.1rem 0.5rem',
            }}
          >
            Replay
          </button>
        )}
      </div>

      <p className="figure-hint" style={{ marginTop: '0.6rem' }}>
        Comments are plain files and accumulate by default. They stay{' '}
        <code style={{ fontFamily: 'var(--mono-font)' }}>pending</code> until the
        author presses Address or enables auto-address.
      </p>
    </div>
  )
}
