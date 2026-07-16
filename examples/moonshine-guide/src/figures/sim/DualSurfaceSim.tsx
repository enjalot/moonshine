import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FigureProps } from '../registry'
import { isSimActivate, SIM_GESTURE_LABEL } from './gesture'

// A pure, local-state simulation of moonshine's "two authors, one source of
// truth" model. Two surfaces edit the same files under content/ with no
// handoff: the AUTHOR clicks and edits in the browser; the AI AGENT edits
// files from the terminal. Git is the shared memory — every browser save is
// auto-committed with a `moonshine-edit:` marker so the agent can read what
// the author changed and treat it as authoritative, while agent commits land
// in the same log without the marker so the boundary stays legible.
//
// No EditContext, no network, no Math.random. The token animates along a
// quadratic bezier via requestAnimationFrame; reduced-motion applies edits
// instantly. Everything below is local state + an SVG overlay.

type Surface = 'author' | 'agent'
type FileKey = 'guide.md' | 'figures/pipeline.json'

type Edit = { file: FileKey; content: string; message: string }
type Commit = { seq: number; hash: string; surface: Surface; message: string; marker: boolean }

// Deterministic per-side edit cycles. Author commits carry the marker;
// agent commits do not — same log, legible boundary.
const AUTHOR_EDITS: Edit[] = [
  { file: 'guide.md', content: 'Intro, with a sharper hook.', message: 'moonshine-edit: tighten intro' },
  { file: 'figures/pipeline.json', content: '{ "node": "embed", "x": 240 }', message: 'moonshine-edit: nudge node' },
  { file: 'guide.md', content: 'Added a worked example.', message: 'moonshine-edit: add example' },
]

const AGENT_EDITS: Edit[] = [
  { file: 'guide.md', content: 'Intro rewritten around the hook.', message: 'rewrite intro section' },
  { file: 'figures/pipeline.json', content: '{ "node": "embed", "y": 60 }', message: 'lay out pipeline figure' },
  { file: 'guide.md', content: 'Method section expanded.', message: 'expand method section' },
]

const INITIAL_FILES: Record<FileKey, string> = {
  'guide.md': '# The moonshine guide',
  'figures/pipeline.json': '{ "node": "embed" }',
}

const INITIAL_LOG: Commit[] = [
  { seq: 2, hash: hashFor(2), surface: 'author', message: 'moonshine-edit: fix title', marker: true },
  { seq: 1, hash: hashFor(1), surface: 'agent', message: 'scaffold guide.md', marker: false },
]

// Deterministic git-style short hash from a sequence number.
function hashFor(seq: number): string {
  const s = (seq * 2654435761) >>> 0
  return s.toString(16).padStart(8, '0').slice(0, 7)
}

// ── Geometry (SVG user units; the whole figure scales via viewBox) ──────────
const W = 720
const H = 412

const AUTHOR_PANEL = { x: 24, y: 22, w: 252, h: 104 }
const AGENT_PANEL = { x: 444, y: 22, w: 252, h: 104 }
const BOX = { x: 80, y: 176, w: 560, h: 214 }

const FILE_RECT: Record<FileKey, { x: number; y: number; w: number; h: number }> = {
  'guide.md': { x: 96, y: 218, w: 244, h: 66 },
  'figures/pipeline.json': { x: 96, y: 296, w: 244, h: 66 },
}

const SRC: Record<Surface, { x: number; y: number }> = {
  author: { x: AUTHOR_PANEL.x + AUTHOR_PANEL.w / 2, y: AUTHOR_PANEL.y + AUTHOR_PANEL.h },
  agent: { x: AGENT_PANEL.x + AGENT_PANEL.w / 2, y: AGENT_PANEL.y + AGENT_PANEL.h },
}

const COLOR: Record<Surface, string> = { author: 'var(--accent)', agent: 'var(--text-2)' }

function fileCenter(f: FileKey) {
  const r = FILE_RECT[f]
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

function control(from: { x: number; y: number }, to: { x: number; y: number }, surface: Surface) {
  const midX = (from.x + to.x) / 2 + (surface === 'author' ? -28 : 28)
  return { x: midX, y: 152 }
}

function quad(
  p0: { x: number; y: number },
  c: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export default function DualSurfaceSim(_props: FigureProps) {
  const [files, setFiles] = useState<Record<FileKey, string>>(INITIAL_FILES)
  const [log, setLog] = useState<Commit[]>(INITIAL_LOG)
  const [active, setActive] = useState<Surface | null>(null)
  const [flashFile, setFlashFile] = useState<FileKey | null>(null)
  const [token, setToken] = useState<{ surface: Surface; x0: number; y0: number } | null>(null)

  const authorIdx = useRef(0)
  const agentIdx = useRef(0)
  const seqRef = useRef(2)
  const busyRef = useRef(false)
  const reducedRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const tokenRef = useRef<SVGGElement | null>(null)
  const timeoutsRef = useRef<number[]>([])

  // Respect prefers-reduced-motion: instant updates, no token flight.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const onChange = () => {
      reducedRef.current = mq.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Clean up any in-flight animation / timers on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      timeoutsRef.current.forEach((id) => clearTimeout(id))
    }
  }, [])

  function applyEdit(surface: Surface, edit: Edit) {
    seqRef.current += 1
    const seq = seqRef.current
    setFiles((f) => ({ ...f, [edit.file]: edit.content }))
    setLog((l) =>
      [
        { seq, hash: hashFor(seq), surface, message: edit.message, marker: surface === 'author' },
        ...l,
      ].slice(0, 5),
    )
    setFlashFile(edit.file)
    const id = window.setTimeout(() => setFlashFile(null), 700)
    timeoutsRef.current.push(id)
  }

  function trigger(surface: Surface, e?: ReactPointerEvent) {
    if (e) {
      if (!isSimActivate(e)) return
      e.preventDefault()
    }
    if (busyRef.current) return

    const list = surface === 'author' ? AUTHOR_EDITS : AGENT_EDITS
    const idxRef = surface === 'author' ? authorIdx : agentIdx
    const edit = list[idxRef.current % list.length]
    idxRef.current += 1

    if (reducedRef.current) {
      setActive(surface)
      applyEdit(surface, edit)
      const id = window.setTimeout(() => setActive(null), 250)
      timeoutsRef.current.push(id)
      return
    }

    busyRef.current = true
    setActive(surface)
    const from = SRC[surface]
    const to = fileCenter(edit.file)
    const ctrl = control(from, to, surface)
    setToken({ surface, x0: from.x, y0: from.y })

    const start = performance.now()
    const dur = 1050
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const p = quad(from, ctrl, to, easeInOut(t))
      if (tokenRef.current) tokenRef.current.setAttribute('transform', `translate(${p.x},${p.y})`)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        applyEdit(surface, edit)
        setToken(null)
        setActive(null)
        busyRef.current = false
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const panelStroke = (s: Surface) =>
    active === s ? COLOR[s] : 'var(--border)'
  const panelStrokeW = (s: Surface) => (active === s ? 2 : 1)

  return (
    <div style={{ fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      <p className="figure-hint" style={{ margin: '0 0 0.6rem' }}>
        {SIM_GESTURE_LABEL} the author or the agent to make an edit and watch it land
        in <code style={{ fontFamily: 'var(--mono-font)' }}>content/</code> and in the git log.
      </p>

      <div style={{ maxWidth: W, margin: '0 auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', userSelect: 'none' }}
        >
          {/* Faint connectors: both surfaces write down into content/ */}
          <path
            d={`M${SRC.author.x},${SRC.author.y} Q${(SRC.author.x + BOX.x + BOX.w / 2) / 2},156 ${BOX.x + BOX.w / 2},${BOX.y}`}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1.5}
            strokeDasharray="4 5"
            opacity={0.7}
          />
          <path
            d={`M${SRC.agent.x},${SRC.agent.y} Q${(SRC.agent.x + BOX.x + BOX.w / 2) / 2},156 ${BOX.x + BOX.w / 2},${BOX.y}`}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1.5}
            strokeDasharray="4 5"
            opacity={0.7}
          />

          {/* ── Author panel (browser) ── */}
          <g
            role="button"
            tabIndex={0}
            aria-label="Make an author edit from the browser"
            onPointerDown={(e) => trigger('author', e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                trigger('author')
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={AUTHOR_PANEL.x}
              y={AUTHOR_PANEL.y}
              width={AUTHOR_PANEL.w}
              height={AUTHOR_PANEL.h}
              rx={8}
              fill="var(--fig-bg)"
              stroke={panelStroke('author')}
              strokeWidth={panelStrokeW('author')}
            />
            {/* browser chrome dots */}
            <circle cx={AUTHOR_PANEL.x + 16} cy={AUTHOR_PANEL.y + 16} r={3} fill="var(--border)" />
            <circle cx={AUTHOR_PANEL.x + 28} cy={AUTHOR_PANEL.y + 16} r={3} fill="var(--border)" />
            <circle cx={AUTHOR_PANEL.x + 40} cy={AUTHOR_PANEL.y + 16} r={3} fill="var(--border)" />
            <text
              x={AUTHOR_PANEL.x + 60}
              y={AUTHOR_PANEL.y + 20}
              style={{ fontFamily: 'var(--heading-font)', fontSize: 13, fontWeight: 600 }}
              fill="var(--text)"
            >
              Author (browser)
            </text>
            <text
              x={AUTHOR_PANEL.x + 16}
              y={AUTHOR_PANEL.y + 52}
              style={{ fontFamily: 'var(--body-font)', fontSize: 12 }}
              fill="var(--text-2)"
            >
              clicks & edits in the page
            </text>
            <text
              x={AUTHOR_PANEL.x + 16}
              y={AUTHOR_PANEL.y + 80}
              style={{ fontFamily: 'var(--mono-font)', fontSize: 12 }}
              fill="var(--accent)"
            >
              the intro could be
              <tspan>
                <animate
                  attributeName="opacity"
                  values="1;0;1"
                  dur="1.1s"
                  repeatCount="indefinite"
                />
                |
              </tspan>
            </text>
          </g>

          {/* ── Agent panel (terminal) ── */}
          <g
            role="button"
            tabIndex={0}
            aria-label="Make an agent edit from the terminal"
            onPointerDown={(e) => trigger('agent', e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                trigger('agent')
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={AGENT_PANEL.x}
              y={AGENT_PANEL.y}
              width={AGENT_PANEL.w}
              height={AGENT_PANEL.h}
              rx={8}
              fill="var(--fig-bg)"
              stroke={panelStroke('agent')}
              strokeWidth={panelStrokeW('agent')}
            />
            <text
              x={AGENT_PANEL.x + 16}
              y={AGENT_PANEL.y + 20}
              style={{ fontFamily: 'var(--heading-font)', fontSize: 13, fontWeight: 600 }}
              fill="var(--text)"
            >
              Agent (terminal)
            </text>
            <text
              x={AGENT_PANEL.x + 16}
              y={AGENT_PANEL.y + 52}
              style={{ fontFamily: 'var(--body-font)', fontSize: 12 }}
              fill="var(--text-2)"
            >
              edits files from the shell
            </text>
            <text
              x={AGENT_PANEL.x + 16}
              y={AGENT_PANEL.y + 80}
              style={{ fontFamily: 'var(--mono-font)', fontSize: 12 }}
              fill="var(--text)"
            >
              $ apply edit to guide.md
            </text>
          </g>

          {/* ── content/ box ── */}
          <rect
            x={BOX.x}
            y={BOX.y}
            width={BOX.w}
            height={BOX.h}
            rx={8}
            fill="var(--bg)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={BOX.x + 16}
            y={BOX.y + 24}
            style={{ fontFamily: 'var(--mono-font)', fontSize: 13, fontWeight: 600 }}
            fill="var(--text-2)"
          >
            content/  — single source both surfaces read
          </text>

          {/* files */}
          {(Object.keys(FILE_RECT) as FileKey[]).map((fk) => {
            const r = FILE_RECT[fk]
            const flashing = flashFile === fk
            return (
              <g key={fk}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={6}
                  fill={flashing ? 'var(--accent-light)' : 'var(--fig-bg)'}
                  stroke={flashing ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={flashing ? 1.5 : 1}
                  style={{ transition: 'fill 0.25s, stroke 0.25s' }}
                />
                <text
                  x={r.x + 14}
                  y={r.y + 25}
                  style={{ fontFamily: 'var(--mono-font)', fontSize: 13, fontWeight: 600 }}
                  fill="var(--text)"
                >
                  {fk}
                </text>
                <text
                  x={r.x + 14}
                  y={r.y + 48}
                  style={{ fontFamily: 'var(--mono-font)', fontSize: 11.5 }}
                  fill="var(--text-2)"
                >
                  {files[fk]}
                </text>
              </g>
            )
          })}

          {/* git log */}
          <text
            x={368}
            y={BOX.y + 50}
            style={{ fontFamily: 'var(--mono-font)', fontSize: 13, fontWeight: 600 }}
            fill="var(--text-2)"
          >
            git log
          </text>
          {log.map((c, i) => {
            const ry = BOX.y + 64 + i * 28
            const newest = i === 0
            return (
              <g key={c.seq}>
                {newest && (
                  <rect
                    x={364}
                    y={ry - 13}
                    width={BOX.x + BOX.w - 364 - 16}
                    height={24}
                    rx={4}
                    fill="var(--accent-light)"
                    opacity={0.5}
                  />
                )}
                <circle cx={376} cy={ry - 2} r={4} fill={COLOR[c.surface]} />
                <text
                  x={390}
                  y={ry + 2}
                  style={{ fontFamily: 'var(--mono-font)', fontSize: 11 }}
                  fill="var(--text-2)"
                >
                  {c.hash}
                </text>
                <text
                  x={448}
                  y={ry + 2}
                  style={{ fontFamily: 'var(--mono-font)', fontSize: 11 }}
                >
                  {c.marker ? (
                    <>
                      <tspan fill="var(--accent)" style={{ fontWeight: 600 }}>
                        moonshine-edit:
                      </tspan>
                      <tspan fill="var(--text)">{c.message.slice('moonshine-edit:'.length)}</tspan>
                    </>
                  ) : (
                    <tspan fill="var(--text)">{c.message}</tspan>
                  )}
                </text>
              </g>
            )
          })}

          {/* traveling token */}
          {token && (
            <g ref={tokenRef} transform={`translate(${token.x0},${token.y0})`}>
              <circle r={11} fill={COLOR[token.surface]} opacity={0.18} />
              <circle r={5} fill={COLOR[token.surface]} />
            </g>
          )}
        </svg>
      </div>

      <p className="figure-hint" style={{ marginTop: '0.6rem' }}>
        Author saves are auto-committed with the{' '}
        <code style={{ fontFamily: 'var(--mono-font)', color: 'var(--accent)' }}>moonshine-edit:</code>{' '}
        marker; before editing, the agent reads the latest such commits and treats them as
        authoritative.
      </p>
    </div>
  )
}
