import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FigureProps } from '../registry'
import { isSimActivate, SIM_GESTURE_LABEL } from './gesture'

// A pure, local-state simulation of moonshine's "baked diagram layout".
//
// The real feature: a diagram's STRUCTURE (nodes + edges) lives in the
// component code; the author's ARRANGEMENT (node positions + viewport)
// lives in a tiny JSON file under content/figures/<id>.json. In dev you
// click "arrange", drag nodes, then "Save layout"; saving writes the
// positions and viewport into that JSON. Because the two are separate,
// regenerating the diagram's structure (an agent rewriting the component)
// never disturbs the author's layout.
//
// No react-flow, no EditContext, no network — a hand-rolled SVG node-link
// graph plus local state. Deterministic: "regenerate" cycles a fixed list.

type Pos = { x: number; y: number }
type Node = { id: string; label: string }
type Structure = { name: string; nodes: Node[]; edges: [string, string][] }

const VB_W = 660
const VB_H = 300
const NODE_W = 96
const NODE_H = 46

// "Code-default" positions — what the component emits before any author
// arrangement. Deliberately a plain stack so the author's baked layout reads
// as a clear improvement. Any node id not listed here falls back to FALLBACK.
const DEFAULT_POS: Record<string, Pos> = {
  input: { x: 110, y: 60 },
  chunk: { x: 110, y: 150 },
  embed: { x: 110, y: 240 },
  index: { x: 360, y: 150 },
  query: { x: 580, y: 150 },
}
// Where a brand-new node (no code default, no baked entry) lands.
const FALLBACK: Pos = { x: 360, y: 255 }

// The cycle "Regenerate structure" walks. Same node *ids* mostly persist
// (so baked positions keep applying), but labels and edges change, and one
// revision introduces a NEW id ("rerank") that has no baked position — it
// must fall back, proving the author's layout survives content changes.
const STRUCTURES: Structure[] = [
  {
    name: 'pipeline',
    nodes: [
      { id: 'input', label: 'Input' },
      { id: 'chunk', label: 'Chunk' },
      { id: 'embed', label: 'Embed' },
      { id: 'index', label: 'Index' },
      { id: 'query', label: 'Query' },
    ],
    edges: [
      ['input', 'chunk'],
      ['chunk', 'embed'],
      ['embed', 'index'],
      ['query', 'index'],
    ],
  },
  {
    // Agent renames every node + adds a direct input→embed shortcut edge.
    name: 'pipeline-v2',
    nodes: [
      { id: 'input', label: 'Source' },
      { id: 'chunk', label: 'Split' },
      { id: 'embed', label: 'Vectorize' },
      { id: 'index', label: 'Store' },
      { id: 'query', label: 'Search' },
    ],
    edges: [
      ['input', 'chunk'],
      ['chunk', 'embed'],
      ['input', 'embed'],
      ['embed', 'index'],
      ['query', 'index'],
    ],
  },
  {
    // Agent adds a NEW node "rerank" (no baked position → falls back).
    name: 'pipeline-v3',
    nodes: [
      { id: 'input', label: 'Source' },
      { id: 'chunk', label: 'Split' },
      { id: 'embed', label: 'Vectorize' },
      { id: 'index', label: 'Store' },
      { id: 'query', label: 'Search' },
      { id: 'rerank', label: 'Rerank' },
    ],
    edges: [
      ['input', 'chunk'],
      ['chunk', 'embed'],
      ['embed', 'index'],
      ['index', 'rerank'],
      ['rerank', 'query'],
    ],
  },
]

const round = (n: number) => Math.round(n)

// The identity viewport the sim "saves" (it has no pan/zoom of its own).
const SIM_VIEWPORT = { x: 0, y: 0, zoom: 1 }

function defaultsFor(struct: Structure): Record<string, Pos> {
  const out: Record<string, Pos> = {}
  for (const n of struct.nodes) out[n.id] = DEFAULT_POS[n.id] ?? FALLBACK
  return out
}

export default function BakedDiagramSim(_props: FigureProps) {
  const [structIdx, setStructIdx] = useState(0)
  const struct = STRUCTURES[structIdx]

  const [arranging, setArranging] = useState(false)
  // Live working positions (what the SVG renders).
  const [positions, setPositions] = useState<Record<string, Pos>>(() =>
    defaultsFor(STRUCTURES[0]),
  )
  // The frozen author arrangement — i.e. content/figures/pipeline.json.
  // null until the author bakes at least once.
  const [baked, setBaked] = useState<Record<string, Pos> | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  // Active drag: which node, and the pointer→origin offset in viewBox units.
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  // Single always-on listener pair, gated by dragRef, so cleanup on unmount
  // is guaranteed regardless of drag state.
  useEffect(() => {
    function toSvg(clientX: number, clientY: number): Pos {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }
      const r = svg.getBoundingClientRect()
      return {
        x: ((clientX - r.left) / r.width) * VB_W,
        y: ((clientY - r.top) / r.height) * VB_H,
      }
    }
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const p = toSvg(e.clientX, e.clientY)
      const x = Math.max(NODE_W / 2, Math.min(VB_W - NODE_W / 2, p.x - d.dx))
      const y = Math.max(NODE_H / 2, Math.min(VB_H - NODE_H / 2, p.y - d.dy))
      setPositions((prev) => ({ ...prev, [d.id]: { x, y } }))
    }
    function onUp() {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('blur', onUp)
    }
  }, [])

  function startDrag(id: string, e: ReactPointerEvent) {
    if (!arranging) return
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * VB_W
    const py = ((e.clientY - r.top) / r.height) * VB_H
    const cur = positions[id] ?? DEFAULT_POS[id] ?? FALLBACK
    dragRef.current = { id, dx: px - cur.x, dy: py - cur.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function saveLayout() {
    const layout: Record<string, Pos> = {}
    for (const n of struct.nodes) {
      const p = positions[n.id] ?? DEFAULT_POS[n.id] ?? FALLBACK
      layout[n.id] = { x: round(p.x), y: round(p.y) }
    }
    setBaked(layout)
    setArranging(false)
  }

  function reset() {
    setBaked(null)
    setPositions(defaultsFor(struct))
    setArranging(false)
  }

  // The payoff: rewrite the diagram's structure (new labels / edges / node)
  // while KEEPING the baked arrangement. Existing ids reuse baked positions;
  // a new id with no baked entry falls back to its default spot.
  function regenerate() {
    const next = (structIdx + 1) % STRUCTURES.length
    const ns = STRUCTURES[next]
    setPositions((prev) => {
      const out: Record<string, Pos> = {}
      for (const n of ns.nodes) {
        out[n.id] = baked?.[n.id] ?? prev[n.id] ?? DEFAULT_POS[n.id] ?? FALLBACK
      }
      return out
    })
    setStructIdx(next)
  }

  // Clicking the diagram is a shortcut into arrange mode (same effect as
  // the "arrange" button); dragging works once arranging.
  function onSvgPointerDown(e: ReactPointerEvent) {
    if (!arranging && isSimActivate(e)) {
      e.preventDefault()
      setArranging(true)
    }
  }

  // The sim has no pan/zoom, so the saved viewport is the identity frame.
  // The real file stores both halves: node positions AND the exact
  // viewport the author saved.
  const jsonText = JSON.stringify(
    baked
      ? { figure: struct.name, layout: baked, viewport: SIM_VIEWPORT }
      : { figure: struct.name, layout: '— not saved yet —' },
    null,
    2,
  )

  return (
    <div style={{ fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      <p className="figure-hint" style={{ margin: '0 0 0.6rem' }}>
        Structure (nodes + edges) lives in code; the author's arrangement lives
        in JSON. {SIM_GESTURE_LABEL} the diagram to arrange, drag nodes, then
        hit Save layout.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {/* ---- diagram ---- */}
        <div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            onPointerDown={onSvgPointerDown}
            style={{
              width: '100%',
              height: 'auto',
              background: 'var(--fig-bg)',
              border: arranging
                ? '1px solid var(--accent)'
                : '1px solid var(--border)',
              borderRadius: '6px',
              touchAction: 'none',
              cursor: arranging ? 'default' : 'pointer',
            }}
          >
            {/* edges */}
            {struct.edges.map(([from, to], i) => {
              const a = positions[from] ?? DEFAULT_POS[from] ?? FALLBACK
              const b = positions[to] ?? DEFAULT_POS[to] ?? FALLBACK
              return (
                <line
                  key={`${from}-${to}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--text-2)"
                  strokeWidth={1.5}
                  opacity={0.55}
                />
              )
            })}
            {/* nodes */}
            {struct.nodes.map((n) => {
              const p = positions[n.id] ?? DEFAULT_POS[n.id] ?? FALLBACK
              const fellBack = !baked?.[n.id] && !DEFAULT_POS[n.id]
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x}, ${p.y})`}
                  onPointerDown={(e) => startDrag(n.id, e)}
                  style={{ cursor: arranging ? 'grab' : 'default' }}
                >
                  <rect
                    x={-NODE_W / 2}
                    y={-NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    rx={10}
                    fill="var(--accent-light)"
                    stroke={fellBack ? 'var(--error)' : 'var(--accent)'}
                    strokeWidth={fellBack ? 2 : 1.5}
                    strokeDasharray={fellBack ? '4 3' : undefined}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fontFamily="var(--heading-font)"
                    fontSize={14}
                    fill="var(--text)"
                  >
                    {n.label}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* control bar — reuses the real arrange/save bar look */}
          <div className="mn-diagram-bar">
            {!arranging ? (
              <button onClick={() => setArranging(true)}>arrange</button>
            ) : (
              <button onClick={saveLayout}>Save layout</button>
            )}
            <button onClick={reset}>Reset</button>
            <button onClick={regenerate}>Regenerate structure</button>
            <span style={{ marginLeft: 'auto' }}>
              {arranging
                ? 'arranging · drag the nodes'
                : baked
                  ? `saved · ${struct.name}`
                  : `reader · ${struct.name}`}
            </span>
          </div>
        </div>

        {/* ---- the JSON a reader loads ---- */}
        <div>
          <div
            className="figure-hint"
            style={{ margin: '0 0 0.3rem', fontFamily: 'var(--mono-font)' }}
          >
            content/figures/{struct.name}.json
          </div>
          <pre
            style={{
              margin: 0,
              padding: '0.6rem 0.7rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontFamily: 'var(--mono-font)',
              fontSize: '0.72rem',
              lineHeight: 1.45,
              color: 'var(--text)',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {jsonText}
          </pre>
        </div>
      </div>

      <p className="figure-hint" style={{ marginTop: '0.7rem' }}>
        Hit <strong>Regenerate structure</strong> to simulate an agent
        rewriting the component: labels and edges change, but every saved
        position survives. A brand-new node with no entry (dashed) falls back
        to a default spot.
      </p>
    </div>
  )
}
