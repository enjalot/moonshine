import { useCallback, useId, useState } from 'react'
import { inOrder, param, type Draggable } from 'dragology'
import type { FigureProps } from '../registry'
import DragFigure from '../drag/DragFigure'
import { each } from '../drag/each'
import { drawEdge, drawNode } from '../diagram/draw'
import { routeEdges } from '../diagram/geometry'
import type { Box, NodeKind } from '../diagram/spec'
import { useWidth } from './useWidth'
import TouchPad from './TouchPad'
import './sims.css'

// A local-state simulation of how a diagram is split between two owners.
//
// The real feature (DiagramFigure.tsx): a figure file declares a
// DiagramSpec (nodes and edges, by id), which the agent may rewrite at any
// time. The author's arrangement is saved to content/figures/<id>.json as
// a box per node id. The two are merged by id on every render, so a
// rewritten spec keeps the author's positions; a node the JSON has no box
// for is placed automatically, and the bar under the diagram says how many.
//
// What the sim keeps: the real drawing code (diagram/draw.tsx and
// geometry.ts), the bar's wording ("edit diagram", "1 node placed
// automatically"), the JSON's shape, the 8px grid. What it changes: the
// real editor opens full screen and does much more; here the boxes are
// dragged in place, each one a d.vary over its own x and y.
// "Agent rewrites the spec" cycles a fixed list, so it is deterministic.

type Pos = { x: number; y: number }
type Node = { id: string; label: string; kind?: NodeKind }
type Structure = { nodes: Node[]; edges: [string, string][] }

// Two canvases, like the harness's wide and narrow arrangements: the wide
// one for a column that has room for it at a readable size, the narrow
// one for phones. Positions are box centres.
type Layout = { w: number; h: number; nodeW: number; nodeH: number; auto: Record<string, Pos> }
const WIDE: Layout = {
  w: 660,
  h: 230,
  nodeW: 112,
  nodeH: 46,
  auto: {
    input: { x: 72, y: 56 },
    chunk: { x: 232, y: 56 },
    embed: { x: 392, y: 56 },
    index: { x: 392, y: 168 },
    query: { x: 584, y: 168 },
    rerank: { x: 584, y: 56 },
  },
}
const NARROW: Layout = {
  w: 296,
  h: 256,
  nodeW: 100,
  nodeH: 44,
  auto: {
    input: { x: 64, y: 40 },
    chunk: { x: 64, y: 128 },
    embed: { x: 64, y: 216 },
    index: { x: 224, y: 216 },
    query: { x: 224, y: 40 },
    rerank: { x: 224, y: 128 },
  },
}

// What the agent writes, three versions of it. Ids persist, so saved
// positions keep applying; the third adds an id the JSON has never seen.
const STRUCTURES: Structure[] = [
  {
    nodes: [
      { id: 'input', label: 'Input', kind: 'data' },
      { id: 'chunk', label: 'Chunk' },
      { id: 'embed', label: 'Embed', kind: 'accent' },
      { id: 'index', label: 'Index', kind: 'store' },
      { id: 'query', label: 'Query', kind: 'data' },
    ],
    edges: [
      ['input', 'chunk'],
      ['chunk', 'embed'],
      ['embed', 'index'],
      ['query', 'index'],
    ],
  },
  {
    // Every label renamed.
    nodes: [
      { id: 'input', label: 'Source', kind: 'data' },
      { id: 'chunk', label: 'Split' },
      { id: 'embed', label: 'Vectorize', kind: 'accent' },
      { id: 'index', label: 'Store', kind: 'store' },
      { id: 'query', label: 'Search', kind: 'data' },
    ],
    edges: [
      ['input', 'chunk'],
      ['chunk', 'embed'],
      ['embed', 'index'],
      ['query', 'index'],
    ],
  },
  {
    // A new node, and the edges through it.
    nodes: [
      { id: 'input', label: 'Source', kind: 'data' },
      { id: 'chunk', label: 'Split' },
      { id: 'embed', label: 'Vectorize', kind: 'accent' },
      { id: 'index', label: 'Store', kind: 'store' },
      { id: 'rerank', label: 'Rerank' },
      { id: 'query', label: 'Search', kind: 'data' },
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

const GRID = 8
const snap = (n: number) => Math.round(n / GRID) * GRID

export default function BakedDiagramSim(_props: FigureProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  // The wide canvas only where it stays readable (labels are 15px, and
  // DragFigure scales the drawing to the column).
  const layout = width >= 580 ? WIDE : NARROW
  return (
    <div className="mn-sim mn-baked-sim" ref={ref}>
      {width > 0 && <Sim key={layout.w} layout={layout} />}
    </div>
  )
}

function Sim({ layout }: { layout: Layout }) {
  const uid = useId().replace(/:/g, '')
  const [version, setVersion] = useState(0)
  const struct = STRUCTURES[version]
  const [arranging, setArranging] = useState(false)
  // Where the boxes are drawn now.
  const [positions, setPositions] = useState<Record<string, Pos>>(layout.auto)
  // content/figures/pipeline.json: null until the first Save.
  const [saved, setSaved] = useState<Record<string, Pos> | null>(null)

  const { nodeW, nodeH } = layout
  const boxOf = (p: Pos): Box => ({ x: p.x - nodeW / 2, y: p.y - nodeH / 2, w: nodeW, h: nodeH })
  const unplaced = saved ? struct.nodes.filter((n) => !saved[n.id]) : []

  const draw = useCallback<Draggable<{ positions: Record<string, Pos> }>>(
    ({ state, d }) => {
      const nodes = Object.fromEntries(struct.nodes.map((n) => [n.id, boxOf(state.positions[n.id] ?? layout.auto[n.id])]))
      const spec = { nodes: struct.nodes, edges: struct.edges.map(([from, to]) => ({ from, to })) }
      const routes = routeEdges(spec, { nodes, groups: {} }, {})
      const c = { uid }
      return (
        <g>
          {each(spec.edges, (e, i) => {
            const g = routes.get(`${e.from}--${e.to}`)
            return g ? drawEdge(c, e, i, g) : null
          })}
          {each(struct.nodes, (n) =>
            drawNode(c, n, nodes[n.id], {
              on: saved && !saved[n.id] ? 'unarranged' : undefined,
              // So a finger can drag a box without scrolling the page.
              children: arranging ? (
                <foreignObject width={nodeW} height={nodeH}>
                  <TouchPad />
                </foreignObject>
              ) : undefined,
              props: arranging
                ? {
                    dragologyOnDrag: () =>
                      d
                        .vary(state, [param('positions', n.id, 'x'), param('positions', n.id, 'y')], {
                          constraint: (s) => [
                            ...inOrder([nodeW / 2, s.positions[n.id].x, layout.w - nodeW / 2]),
                            ...inOrder([nodeH / 2, s.positions[n.id].y, layout.h - nodeH / 2]),
                          ],
                        })
                        // The editor's 8px grid.
                        .onDrop((s) => ({
                          positions: { ...s.positions, [n.id]: { x: snap(s.positions[n.id].x), y: snap(s.positions[n.id].y) } },
                        })),
                  }
                : undefined,
            }),
          )}
        </g>
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [struct, saved, arranging, uid, layout],
  )

  const current = (id: string) => positions[id] ?? layout.auto[id]

  function save() {
    setSaved(Object.fromEntries(struct.nodes.map((n) => [n.id, current(n.id)])))
    setArranging(false)
  }

  function cancel() {
    setPositions({ ...layout.auto, ...saved })
    setArranging(false)
  }

  // The agent regenerates the figure file. Nothing here reads or writes
  // the saved positions: they apply again by id.
  function rewrite() {
    setVersion((v) => (v + 1) % STRUCTURES.length)
  }

  function deleteFile() {
    setSaved(null)
    setPositions(layout.auto)
    setArranging(false)
  }

  const prev = STRUCTURES[(version + STRUCTURES.length - 1) % STRUCTURES.length]
  const prevLabel = Object.fromEntries(prev.nodes.map((n) => [n.id, n.label]))
  const prevEdges = new Set(prev.edges.map(([a, b]) => `${a}→${b}`))
  const changed = version > 0

  return (
    <>
      <p className="figure-hint">
        press <strong>edit diagram</strong>, drag the boxes, <strong>Save</strong>. Then let the agent rewrite the spec.
      </p>
      <div className={`mn-sim-baked${arranging ? ' is-arranging' : ''}`}>
        <DragFigure
          draggable={draw}
          width={layout.w}
          height={layout.h}
          state={{ positions }}
          onState={(s) => setPositions(s.positions)}
          label={`A pipeline diagram: ${struct.nodes.map((n) => n.label).join(', ')}. ${struct.edges.length} arrows connect them.`}
        />
      </div>

      {/* The bar the harness puts under a diagram in dev. */}
      <div className="mn-diagram-bar">
        {arranging ? (
          <>
            <button type="button" onClick={save}>
              Save
            </button>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
            <span>drag the boxes · the real editor opens full screen</span>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setArranging(true)}>
              edit diagram
            </button>
            <span aria-live="polite">
              {unplaced.length > 0
                ? `${unplaced.length} node${unplaced.length > 1 ? 's' : ''} placed automatically`
                : saved
                  ? 'arrangement saved'
                  : 'no arrangement saved: the layout is automatic'}
            </span>
          </>
        )}
      </div>

      <div className="mn-sim-split mn-sim-owners">
        <div>
          <div className="mn-sim-pane-name">Pipeline.tsx · the agent's</div>
          <pre className="mn-sim-code" aria-live="polite">
            <span className="mn-sim-dim">nodes</span>
            {'\n'}
            {struct.nodes.map((n) => (
              <span key={n.id} data-on={changed && prevLabel[n.id] !== n.label ? 'changed' : undefined}>
                {`  ${n.id.padEnd(7)}"${n.label}"\n`}
              </span>
            ))}
            <span className="mn-sim-dim">edges</span>
            {'\n'}
            {struct.edges.map(([a, b]) => (
              <span key={`${a}-${b}`} data-on={changed && !prevEdges.has(`${a}→${b}`) ? 'changed' : undefined}>
                {`  ${a} → ${b}\n`}
              </span>
            ))}
          </pre>
          <div className="mn-knobs-actions">
            <button type="button" onClick={rewrite}>
              Agent rewrites the spec
            </button>
          </div>
        </div>
        <div>
          <div className="mn-sim-pane-name">content/figures/pipeline.json · yours</div>
          <pre className="mn-sim-code" aria-live="polite">
            {saved ? (
              <>
                {'{\n  "figure": "pipeline",\n  "nodes": {\n'}
                {Object.entries(saved).map(([id, p], i, all) => {
                  const b = boxOf(p)
                  return `    "${id}": { "x": ${b.x}, "y": ${b.y}, "w": ${b.w}, "h": ${b.h} }${i < all.length - 1 ? ',' : ''}\n`
                })}
                {'  }\n}'}
              </>
            ) : (
              <span className="mn-sim-dim">(no file yet. Save writes one box per node id.)</span>
            )}
          </pre>
          <div className="mn-knobs-actions">
            <button type="button" onClick={deleteFile} disabled={!saved}>
              Delete the file
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
