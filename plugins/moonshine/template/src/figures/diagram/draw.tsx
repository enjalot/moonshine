import type { ReactNode, SVGProps } from 'react'
import { rotateRad, scale, translate } from 'dragology'
import { each } from '../drag/each'
import { routeEdges, type EdgeGeom, type Placed } from './geometry'
import { edgeKey, type Annotation, type BakedDiagram, type Box, type DiagramSpec, type SpecEdge, type SpecGroup, type SpecNode } from './spec'
import { CHEVRON, edgeLabelWidth, FONTS, LINE, wrap } from './text'
import { glyph } from './glyphs'
import { isTile, TILE, tileLabelOffset, tileLines } from './tile'

// Diagrams drawn as SVG, for readers (DiagramFigure) and the editor
// (DiagramArrange) alike. Each piece is a plain function from boxes to SVG
// with a stable `id`, so Dragology can draw any state of a diagram, blend
// between two of them, and animate from one to the next. Everything is
// styled from tokens.css via the .mn-dg-* rules in article.css, so
// diagrams follow light/dark mode and the article's type with no baking.
//
// Dragology's rules apply here: position with `transform`, never x/y; no
// fragments; lists via each(); ids are unique across the drawing. And
// because Dragology blends every prop between two drawings and can't blend
// two different strings, an element's className never changes: what
// varies (kind, active, selected) goes in data-kind and data-on, which it
// doesn't blend, and the CSS selects on those. Children that come and go
// carry a dragologyKey so the rest still pair up.

export type DrawCtx = {
  // Prefix for element ids, unique per diagram on the page.
  uid: string
  // The spec part a :term is lighting up.
  active?: string | null
}

// Ids for the pieces of a diagram. Spec ids are free-form, so anything
// outside [A-Za-z0-9_-] is replaced (Dragology also forbids "/").
const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_')
export const ids = {
  node: (c: DrawCtx, id: string) => `${c.uid}-n-${clean(id)}`,
  group: (c: DrawCtx, id: string) => `${c.uid}-g-${clean(id)}`,
  annot: (c: DrawCtx, id: string) => `${c.uid}-a-${clean(id)}`,
  // Edges go by position in spec.edges, which survives changing an
  // edge's ends (its key changes with them).
  edge: (c: DrawCtx, i: number) => `${c.uid}-e-${i}`,
  edgeLabel: (c: DrawCtx, i: number) => `${c.uid}-el-${i}`,
}

type GProps = SVGProps<SVGGElement> & { 'data-on'?: string }

// The data-on value for a set of flags.
export const flags = (...f: (string | false | null | undefined)[]) => f.filter(Boolean).join(' ') || undefined

const NODE_PAD = 12
const RADIUS: Record<string, number> = { process: 5, data: 3, external: 14, decision: 2, accent: 5, note: 5 }

// A tile: a rounded square holding the node's glyph, with the label outside
// it. The label is drawn inside the node's own group, so it moves with the
// tile under every drag and needs no arranging of its own.
function drawTile(c: DrawCtx, n: SpecNode, b: Box, opts: { on?: string; props?: GProps; children?: ReactNode }) {
  const active = c.active === n.id
  const lines = tileLines(n)
  const lb = tileLabelOffset(n, b)
  const side = n.labelSide ?? 'below'
  const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle'
  const tx = side === 'left' ? lb.x + lb.w : side === 'right' ? lb.x : b.w / 2
  const k = Math.min(b.w, b.h) / TILE
  const rx = Math.min(12, b.w / 4, b.h / 4)
  return (
    <g
      id={ids.node(c, n.id)}
      transform={translate(b.x, b.y)}
      className="mn-dg-node"
      data-kind="tile"
      data-on={flags(active && 'active', n.detail && 'detail', n.dashed && 'dashed', n.tone && `tone-${n.tone}`, opts.on)}
      {...opts.props}
    >
      <rect className="mn-dg-halo" x={-4} y={-4} width={b.w + 8} height={b.h + 8} rx={rx + 4} />
      <rect className="mn-dg-shape" width={b.w} height={b.h} rx={rx} />
      <g dragologyKey={`glyph-${n.icon}`} className="mn-dg-glyph" transform={translate(b.w / 2, b.h / 2) + scale(1.4 * k)}>
        {glyph(n.icon)}
      </g>
      {/* Keyed by side: the anchor differs, and Dragology can't blend that. */}
      <text dragologyKey={`label-${side}`} className="mn-dg-tile-label" textAnchor={anchor}>
        {each(lines, (l, i) => (
          <tspan x={tx} y={lb.y + 13 + i * LINE.tile}>
            {l}
          </tspan>
        ))}
      </text>
      {n.badge ? (
        <g dragologyKey="badge" className="mn-dg-badge" transform={translate(b.w - 3, 3)}>
          <rect x={-(n.badge.length * 7.5 + 10) / 2} y={-9} width={n.badge.length * 7.5 + 10} height={18} rx={9} />
          <text textAnchor="middle" dominantBaseline="central">
            {n.badge}
          </text>
        </g>
      ) : null}
      <g dragologyKey="extra">{opts.children}</g>
    </g>
  )
}

export function drawNode(c: DrawCtx, n: SpecNode, b: Box, opts: { on?: string; props?: GProps; children?: ReactNode } = {}) {
  if (isTile(n)) return drawTile(c, n, b, opts)
  const kind = n.kind ?? 'process'
  const active = c.active === n.id
  const font = kind === 'note' ? FONTS.note : FONTS.node
  const lines = wrap(n.label, font, b.w - 2 * NODE_PAD)
  const rx = kind === 'store' ? b.h / 2 : (RADIUS[kind] ?? 5)
  const top = b.h / 2 - ((lines.length - 1) * LINE.node) / 2
  return (
    <g
      id={ids.node(c, n.id)}
      transform={translate(b.x, b.y)}
      className="mn-dg-node"
      data-kind={kind}
      data-on={flags(active && 'active', n.detail && 'detail', n.dashed && 'dashed', opts.on)}
      {...opts.props}
    >
      <rect className="mn-dg-halo" x={-4} y={-4} width={b.w + 8} height={b.h + 8} rx={rx + 4} />
      <rect className="mn-dg-shape" width={b.w} height={b.h} rx={rx} />
      {/* The decision kind's inner border; hidden for the others. */}
      <rect className="mn-dg-shape mn-dg-shape-inner" x={3.5} y={3.5} width={Math.max(0, b.w - 7)} height={Math.max(0, b.h - 7)} rx={1} />
      <text className="mn-dg-label" textAnchor="middle" dominantBaseline="central">
        {each(lines, (l, i) => (
          <tspan x={b.w / 2} y={top + i * LINE.node}>
            {l}
          </tspan>
        ))}
      </text>
      <g dragologyKey="extra">{opts.children}</g>
    </g>
  )
}

export function drawGroup(c: DrawCtx, g: SpecGroup, b: Box, opts: { props?: GProps; children?: ReactNode } = {}) {
  return (
    <g id={ids.group(c, g.id)} transform={translate(b.x, b.y)} className="mn-dg-group" data-on={flags(c.active === g.id && 'active')} {...opts.props}>
      <rect className="mn-dg-group-box" width={b.w} height={b.h} rx={8} />
      <text className="mn-dg-group-label" x={12} y={22}>
        {g.label}
      </text>
      <g dragologyKey="extra">{opts.children}</g>
    </g>
  )
}

export function drawAnnot(c: DrawCtx, a: Annotation, opts: { on?: string; props?: GProps; children?: ReactNode } = {}) {
  const note = a.kind === 'note'
  const px = note ? 9 : 0
  const py = note ? 6 : 0
  const lines = wrap(a.text, FONTS.annot, a.w - 2 * px)
  return (
    <g
      id={ids.annot(c, a.id)}
      transform={translate(a.x, a.y)}
      className="mn-dg-annot"
      data-kind={a.kind}
      data-on={flags(c.active === a.id && 'active', opts.on)}
      {...opts.props}
    >
      <rect className="mn-dg-annot-box" width={a.w} height={a.h} rx={4} />
      <text className="mn-dg-annot-text">
        {each(lines, (l, i) => (
          <tspan x={px} y={py + 14 + i * LINE.annot}>
            {l}
          </tspan>
        ))}
      </text>
      <g dragologyKey="extra">{opts.children}</g>
    </g>
  )
}

export { edgeLabelWidth }

export function drawEdge(
  c: DrawCtx,
  e: SpecEdge,
  i: number,
  g: EdgeGeom,
  opts: { on?: string; props?: GProps; labelProps?: GProps; label?: string } = {},
) {
  const active = c.active === edgeKey(e)
  const label = opts.label ?? e.label
  const arrows = e.arrows ?? 'end'
  const lw = label ? edgeLabelWidth(label, arrows) : 0
  // Direction marks in the label: which way the link runs where the label
  // sits, so a label read on its own still says who acts on whom. A mark
  // sits at the end of the pill it points out of; on a vertical run the
  // forward mark takes the right end.
  const fwd = arrows === 'end' || arrows === 'both'
  const back = arrows === 'start' || arrows === 'both'
  const [dx, dy] = g.ldir
  const fwdRight = dx > 0 || dx === 0
  const right = fwdRight ? fwd : back
  const left = fwdRight ? back : fwd
  const along = Math.atan2(dy, dx)
  const rightAngle = fwdRight ? along : along + Math.PI
  const leftAngle = fwdRight ? along + Math.PI : along
  const textX = ((left ? 1 : 0) - (right ? 1 : 0)) * (CHEVRON / 2)
  return (
    <g
      id={ids.edge(c, i)}
      className="mn-dg-edge"
      data-kind={e.family ?? 'plain'}
      data-on={flags(e.dashed && 'dashed', e.animated && 'animated', active && 'active', opts.on)}
      {...opts.props}
    >
      <path className="mn-dg-edge-hit" d={g.path} />
      <path className="mn-dg-edge-line" d={g.path} />
      {fwd ? <path dragologyKey="head" className="mn-dg-arrow" d={HEAD_PATH} transform={translate(g.p2[0], g.p2[1]) + rotateRad(g.angle)} /> : null}
      {back ? <path dragologyKey="tail" className="mn-dg-arrow" d={HEAD_PATH} transform={translate(g.p1[0], g.p1[1]) + rotateRad(g.angle1)} /> : null}
      {/* Dragology lifts an element with an id out of its parent, so the label carries the family itself. */}
      {label ? (
        <g id={ids.edgeLabel(c, i)} className="mn-dg-edge-label" data-kind={e.family ?? 'plain'} transform={translate(g.lx, g.ly)} {...opts.labelProps}>
          <rect x={-lw / 2} y={-10} width={lw} height={20} rx={4} />
          <text x={textX} textAnchor="middle" dominantBaseline="central">
            {label}
          </text>
          {right ? <path dragologyKey="chev-r" className="mn-dg-chevron" d={CHEVRON_PATH} transform={translate(lw / 2 - 9, 0) + rotateRad(rightAngle)} /> : null}
          {left ? <path dragologyKey="chev-l" className="mn-dg-chevron" d={CHEVRON_PATH} transform={translate(-lw / 2 + 9, 0) + rotateRad(leftAngle)} /> : null}
        </g>
      ) : null}
    </g>
  )
}

// Arrowhead, tip at the origin pointing along +x (length matches HEAD in
// geometry.ts), and the smaller mark used inside a label.
const HEAD_PATH = 'M 0 0 L -12 -6 L -9 0 L -12 6 Z'
const CHEVRON_PATH = 'M 4 0 L -3 -4 L -3 4 Z'

// A whole diagram, as readers see it: groups under edges under boxes,
// notes on top. `nodeProps` adds handlers to boxes (hover text).
export function drawDiagram(
  c: DrawCtx,
  spec: DiagramSpec,
  placed: Placed,
  arr: Pick<BakedDiagram, 'edges' | 'annotations'> | null,
  nodeProps?: (n: SpecNode, b: Box) => GProps | undefined,
) {
  const routes = routeEdges(spec, placed, arr?.edges)
  return (
    <g>
      {each(spec.groups ?? [], (g) => (placed.groups[g.id] ? drawGroup(c, g, placed.groups[g.id]) : null))}
      {each(spec.edges, (e, i) => {
        const g = routes.get(edgeKey(e))
        return g ? drawEdge(c, e, i, g) : null
      })}
      {each(spec.nodes, (n) => {
        const b = placed.nodes[n.id]
        return b ? drawNode(c, n, b, { props: nodeProps?.(n, b) }) : null
      })}
      {each(arr?.annotations ?? [], (a) => drawAnnot(c, a))}
    </g>
  )
}
