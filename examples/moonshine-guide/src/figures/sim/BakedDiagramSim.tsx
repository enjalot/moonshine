import { useCallback, useId, useState } from 'react'
import { inOrder, param, type Draggable } from 'dragology'
import type { FigureProps } from '../registry'
import DragFigure from '../drag/DragFigure'
import { each } from '../drag/each'
import { drawEdge, drawNode } from '../diagram/draw'
import { routeEdges } from '../diagram/geometry'
import type { Box } from '../diagram/spec'
import { SIM_GESTURE_LABEL } from './gesture'
import './sims.css'

// A pure, local-state simulation of moonshine's "baked diagram layout".
//
// The real feature: a diagram's STRUCTURE (a DiagramSpec of nodes + edges)
// lives in the component code; the author's ARRANGEMENT lives in
// content/figures/<id>.json. In dev you click "arrange", which opens a
// full-screen editor; Save writes node boxes (plus edge sides, notes and
// a crop frame, when used) into that JSON. Because the two are matched by id, regenerating the spec (an agent
// rewriting the component) never disturbs the author's layout.
//
// No EditContext, no network: the real diagram drawing (diagram/draw.tsx)
// over local state, by declarative dragging (drag/): moving a node is
// d.vary over its x and y, and "regenerate" just sets the next structure,
// which Dragology animates to (new labels and edges, the same positions).
// Deterministic: "regenerate" cycles a fixed list.

type Pos = { x: number; y: number }
type Node = { id: string; label: string }
type Structure = { name: string; nodes: Node[]; edges: [string, string][] }

const VB_W = 660
const VB_H = 300
const NODE_W = 110
const NODE_H = 48

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

  const uid = useId().replace(/:/g, '')
  const box = (p: Pos): Box => ({ x: p.x - NODE_W / 2, y: p.y - NODE_H / 2, w: NODE_W, h: NODE_H })

  // The drawing: the real diagram pieces, positioned from `positions`.
  // While arranging, each node varies its own x and y, kept on the canvas.
  const draw = useCallback<Draggable<{ positions: Record<string, Pos> }>>(
    ({ state, d }) => {
      const nodes = Object.fromEntries(struct.nodes.map((n) => [n.id, box(state.positions[n.id] ?? DEFAULT_POS[n.id] ?? FALLBACK)]))
      const spec = { nodes: struct.nodes, edges: struct.edges.map(([from, to]) => ({ from, to })) }
      const routes = routeEdges(spec, { nodes, groups: {} }, {})
      const c = { uid }
      return (
        <g>
          {each(spec.edges, (e, i) => {
            const g = routes.get(`${e.from}--${e.to}`)
            return g ? drawEdge(c, e, i, g) : null
          })}
          {each(struct.nodes, (n) => {
            const fellBack = !baked?.[n.id] && !DEFAULT_POS[n.id]
            return drawNode(c, { ...n, kind: 'accent' }, nodes[n.id], {
              on: fellBack ? 'unarranged' : undefined,
              props: arranging
                ? {
                    dragologyOnDrag: () =>
                      d.vary(state, [param('positions', n.id, 'x'), param('positions', n.id, 'y')], {
                        constraint: (s) => [
                          ...inOrder([NODE_W / 2, s.positions[n.id].x, VB_W - NODE_W / 2]),
                          ...inOrder([NODE_H / 2, s.positions[n.id].y, VB_H - NODE_H / 2]),
                        ],
                      }),
                  }
                : undefined,
            })
          })}
        </g>
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [struct, baked, arranging, uid],
  )

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

  // The real file can also carry edge sides, annotations and a crop frame.
  const jsonText = JSON.stringify(
    baked
      ? {
          figure: struct.name,
          nodes: Object.fromEntries(
            Object.entries(baked).map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y), w: NODE_W, h: NODE_H }]),
          ),
        }
      : { figure: struct.name, nodes: '— not saved yet —' },
    null,
    2,
  )

  return (
    <div style={{ fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      <p className="figure-hint" style={{ margin: '0 0 0.6rem' }}>
        Structure (nodes + edges) lives in code; the author's arrangement lives
        in JSON. {SIM_GESTURE_LABEL} the diagram to arrange, drag nodes, then
        hit Save.
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
          {/* Clicking the diagram is a shortcut into arrange mode. */}
          <div
            className={`mn-sim-baked${arranging ? ' is-arranging' : ''}`}
            onClick={() => !arranging && setArranging(true)}
          >
            <DragFigure
              draggable={draw}
              width={VB_W}
              height={VB_H}
              state={{ positions }}
              onState={(s) => setPositions(s.positions)}
              label="A small pipeline diagram whose nodes can be dragged into place once arranging."
            />
          </div>

          {/* control bar — reuses the real arrange/save bar look */}
          <div className="mn-diagram-bar">
            {!arranging ? (
              <button onClick={() => setArranging(true)}>arrange</button>
            ) : (
              <button onClick={saveLayout}>Save</button>
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
        position survives. A brand-new node with no saved box (dashed) is
        placed in a free spot for the author to drag into place.
      </p>
    </div>
  )
}
