// A starter board for system and relationship diagrams: glyph tiles with
// the label outside, square-routed links with a tag naming each one, and
// zones for the boundaries things sit inside. Copy this file and board.css
// into the article's src/figures/board/ and change them there: add the
// glyphs and link families the article's subject needs, drop the ones it
// doesn't.
//
// Coordinates are real pixels. The board is drawn at its natural size and
// scrolls sideways inside its own box when the column is narrower, so text
// never shrinks below what is set in board.css.

import type { ReactNode } from 'react'
import './board.css'

export type Pt = [number, number]
type Side = 'l' | 'r' | 't' | 'b'

// ------------------------------------------------------------------ glyphs
// One glyph per KIND of thing, drawn in a 24x24 box centred on (0,0).
// Every service is the same cube whatever it runs; what tells two of them
// apart is the label. The family sets the colour.

export type GlyphKind = 'person' | 'service' | 'database' | 'store' | 'queue' | 'document' | 'function' | 'key'
export type GlyphFamily = 'actor' | 'compute' | 'data' | 'access'

const FAMILY: Record<GlyphKind, GlyphFamily> = {
  person: 'actor',
  service: 'compute',
  function: 'compute',
  database: 'data',
  store: 'data',
  queue: 'data',
  document: 'data',
  key: 'access',
}

function shape(kind: GlyphKind): ReactNode {
  switch (kind) {
    case 'person':
      return (
        <>
          <circle cx={0} cy={-4.5} r={4} />
          <path d="M-8,9.5 Q-8,1.5 0,1.5 Q8,1.5 8,9.5 Z" />
        </>
      )
    case 'service':
      return (
        <>
          <path d="M0,-9.5 L8.4,-4.75 V4.75 L0,9.5 L-8.4,4.75 V-4.75 Z" />
          <path className="bd-g-line" d="M-8.4,-4.75 L0,0 L8.4,-4.75 M0,0 V9.5" />
        </>
      )
    case 'database':
      return (
        <>
          <path d="M-8,-5.5 V5.5 A8,3.2 0 0 0 8,5.5 V-5.5" />
          <ellipse cx={0} cy={-5.5} rx={8} ry={3.2} />
          <path className="bd-g-line" d="M-8,0 A8,3.2 0 0 0 8,0" />
        </>
      )
    case 'store':
      return (
        <>
          <path d="M-8.5,-6 L-6,8.5 H6 L8.5,-6 Z" />
          <path className="bd-g-line" d="M-9.5,-6 H9.5" />
        </>
      )
    case 'queue':
      return (
        <>
          <rect x={-10} y={-5} width={5.5} height={10} rx={1.2} />
          <rect x={-2.75} y={-5} width={5.5} height={10} rx={1.2} />
          <rect x={4.5} y={-5} width={5.5} height={10} rx={1.2} />
        </>
      )
    case 'document':
      return (
        <>
          <path d="M-6.5,-9.5 H2.5 L7,-5 V9.5 H-6.5 Z" />
          <path className="bd-g-line" d="M2.5,-9.5 V-5 H7 M-3,0.5 H3.5 M-3,4.5 H3.5" />
        </>
      )
    case 'function':
      return (
        <>
          <rect x={-9} y={-9} width={18} height={18} rx={3} />
          <path className="bd-g-line" d="M3.5,-5 Q0.5,-6 0,-2.5 L-1,3.5 Q-1.5,6.5 -4,5.5 M-3,-1 H3" />
        </>
      )
    case 'key':
      return (
        <>
          <circle cx={-4.5} cy={0} r={4.5} />
          <path className="bd-g-line" d="M0,0 H9.5 M6,0 V3.5 M9.5,0 V3" />
        </>
      )
  }
}

// Also the inline form: <Glyph kind="database" size={16} /> inside an
// inline-viz or an HTML key puts the same mark in the prose.
export function Glyph({ kind, size = 26 }: { kind: GlyphKind; size?: number }) {
  return (
    <g className="bd-g" data-family={FAMILY[kind]} transform={`scale(${size / 24})`}>
      {shape(kind)}
    </g>
  )
}

// ------------------------------------------------------------------ pieces

export type Piece = {
  id: string
  kind: GlyphKind
  // One short line, two at most. Detail goes in the caption or a tooltip.
  label: string | string[]
  x: number
  y: number
  r?: number
  // Label over the tile, for a piece whose links leave downward.
  labelAbove?: boolean
  // Drawn dashed: proposed, missing, or not there yet. Say which in the caption.
  pending?: boolean
  // A small corner mark: a count ("12", "x4") or a step number.
  badge?: string
}

export type Link = {
  id: string
  from: string
  to: string
  // The verb on the tag. A link with nothing to say takes no tag.
  text?: string
  // Colours the link by what it carries. Keep to four or fewer per article.
  family?: 'flow' | 'data' | 'access' | 'plain'
  pending?: boolean
  // Sides. The default (out right, in left) reads as a flow; 'b' to 't'
  // runs down the page. Keep outputs on the right or bottom and inputs on
  // the left or top so a side means the same thing on every tile.
  out?: Side
  in?: Side
  // Offsets along a side, to give two links on one side their own ports.
  outAt?: number
  inAt?: number
  // Where the middle leg runs (an x for r-to-l, a y for b-to-t), to steer
  // a link clear of a tile or of another link.
  mid?: number
  // Where the tag sits, when the middle of the longest leg is taken.
  tagAt?: Pt
}

const R = 24
const at = (x: number, y: number) => `translate(${x},${y})`
const lines = (label: string | string[]) => (typeof label === 'string' ? [label] : label)

// Which pieces and links are in focus. Empty or undefined: everything is.
export type Focus = Set<string> | undefined
const state = (id: string, focus: Focus) => (!focus || focus.size === 0 ? 'rest' : focus.has(id) ? 'lit' : 'dim')

export function Tile({ piece, focus }: { piece: Piece; focus?: Focus }) {
  const r = piece.r ?? R
  const text = lines(piece.label)
  const round = piece.kind === 'person'
  return (
    <g className="bd-tile" transform={at(piece.x, piece.y)} data-pending={piece.pending ? 'yes' : 'no'} data-state={state(piece.id, focus)}>
      {round ? <circle className="bd-tile-box" r={r} /> : <rect className="bd-tile-box" x={-r} y={-r} width={r * 2} height={r * 2} rx={8} />}
      <Glyph kind={piece.kind} />
      {piece.badge && (
        <g className="bd-badge" transform={at(r - 2, -r + 2)}>
          <rect x={-11} y={-9} width={22} height={18} rx={9} />
          <text y={4.5} textAnchor="middle">
            {piece.badge}
          </text>
        </g>
      )}
      <text className="bd-label" y={piece.labelAbove ? -r - 9 - (text.length - 1) * 16 : r + 18} textAnchor="middle">
        {text.map((l, i) => (
          <tspan key={i} x={0} dy={i ? 16 : 0}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  )
}

// A walled area: an account, a team, a machine, a trust boundary. Draw two
// figures that share zones with the zones in the same place in both.
export function Zone({ label, x, y, w, h, tone = 0, labelBottom }: { label: string; x: number; y: number; w: number; h: number; tone?: 0 | 1 | 2; labelBottom?: boolean }) {
  return (
    <g className="bd-zone" data-tone={tone} transform={at(x, y)}>
      <rect width={w} height={h} rx={6} />
      <text x={14} y={labelBottom ? h - 12 : 22}>
        {label}
      </text>
    </g>
  )
}

// ------------------------------------------------------------------ links

function port(p: Piece, side: Side, off = 0): Pt {
  const r = p.r ?? R
  if (side === 'r') return [p.x + r, p.y + off]
  if (side === 'l') return [p.x - r, p.y + off]
  if (side === 'b') return [p.x + off, p.y + r]
  return [p.x + off, p.y - r]
}

const horizontal = (s: Side) => s === 'l' || s === 'r'

// Square corners only: every leg is horizontal or vertical.
function route(p: Pt, q: Pt, out: Side, inn: Side, mid?: number): Pt[] {
  if (horizontal(out) && horizontal(inn)) {
    if (p[1] === q[1]) return [p, q]
    const mx = mid ?? (p[0] + q[0]) / 2
    return [p, [mx, p[1]], [mx, q[1]], q]
  }
  if (!horizontal(out) && !horizontal(inn)) {
    if (p[0] === q[0]) return [p, q]
    const my = mid ?? (p[1] + q[1]) / 2
    return [p, [p[0], my], [q[0], my], q]
  }
  return horizontal(out) ? [p, [q[0], p[1]], q] : [p, [p[0], q[1]], q]
}

function rounded(pts: Pt[], radius = 8): string {
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const [cx, cy] = pts[i + 1]
    const r = Math.min(radius, (Math.abs(bx - ax) + Math.abs(by - ay)) / 2, (Math.abs(cx - bx) + Math.abs(cy - by)) / 2)
    const sx = bx - Math.sign(bx - ax) * r
    const sy = by - Math.sign(by - ay) * r
    const ex = bx + Math.sign(cx - bx) * r
    const ey = by + Math.sign(cy - by) * r
    d += ` L${sx},${sy} Q${bx},${by} ${ex},${ey}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${last[0]},${last[1]}`
}

const tagWidth = (text: string) => text.length * 7.9 + 16

function Tube({ pts, link, focus }: { pts: Pt[]; link: Link; focus?: Focus }) {
  const d = rounded(pts)
  const [ex, ey] = pts[pts.length - 1]
  const [px, py] = pts[pts.length - 2]
  const angle = (Math.atan2(ey - py, ex - px) * 180) / Math.PI
  return (
    <g className="bd-tube" data-family={link.family ?? 'plain'} data-pending={link.pending ? 'yes' : 'no'} data-state={state(link.id, focus)}>
      {/* The halo is what makes a later link read as passing over an earlier one. */}
      <path className="bd-tube-halo" d={d} />
      <path className="bd-tube-case" d={d} />
      <path className="bd-tube-core" d={d} />
      <circle className="bd-port" cx={pts[0][0]} cy={pts[0][1]} r={3} />
      <path className="bd-arrow" d="M-8,-4.6 L0,0 L-8,4.6 Z" transform={`${at(ex, ey)} rotate(${angle})`} />
    </g>
  )
}

function Tag({ x, y, link, focus }: { x: number; y: number; link: Link; focus?: Focus }) {
  const w = tagWidth(link.text ?? '')
  return (
    <g className="bd-tag" transform={at(x, y)} data-state={state(link.id, focus)}>
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} />
      <text y={4.5} textAnchor="middle">
        {link.text}
      </text>
    </g>
  )
}

// ------------------------------------------------------------------- board

// Draw order is the point: zones, then links, then tiles, then tags, so no
// link covers a tile and no tag is cut by a link. `children` are drawn
// under the links (zones, enclosures); `over` on top of everything.
export function Board(props: { w: number; h: number; label: string; pieces: Piece[]; links: Link[]; focus?: Focus; floor?: boolean; children?: ReactNode; over?: ReactNode }) {
  const { w, h, label, pieces, links, focus, floor = true, children, over } = props
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const routed = links.map((link) => {
    const a = byId.get(link.from)
    const b = byId.get(link.to)
    if (!a || !b) throw new Error(`board link ${link.id}: unknown piece ${a ? link.to : link.from}`)
    const out = link.out ?? 'r'
    const inn = link.in ?? 'l'
    const pts = route(port(a, out, link.outAt), port(b, inn, link.inAt), out, inn, link.mid)
    // The tag goes on the middle of the longest leg, which is the leg least
    // likely to hold a corner or a crossing.
    let best = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const len = (k: number) => Math.abs(pts[k + 1][0] - pts[k][0]) + Math.abs(pts[k + 1][1] - pts[k][1])
      if (len(i) > len(best)) best = i
    }
    const tag: Pt = link.tagAt ?? [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2]
    // A tag on a horizontal leg shorter than itself covers the tiles at
    // both ends. Shorten the verb, move the tiles apart, or set tagAt.
    const flat = pts[best][1] === pts[best + 1][1]
    if (import.meta.env.DEV && link.text && !link.tagAt && flat && tagWidth(link.text) + 16 > Math.abs(pts[best + 1][0] - pts[best][0])) {
      console.warn(`board link ${link.id}: tag "${link.text}" is wider than the leg it sits on`)
    }
    return { link, pts, tag }
  })
  return (
    <div className="bd" data-floor={floor ? 'yes' : 'no'}>
      <div className="bd-scroll" tabIndex={0} role="group" aria-label={`${label} (scrolls sideways on a narrow screen)`}>
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
          {floor && <rect className="bd-floor" width={w} height={h} rx={6} />}
          {children}
          {routed.map((r) => (
            <Tube key={r.link.id} pts={r.pts} link={r.link} focus={focus} />
          ))}
          {pieces.map((p) => (
            <Tile key={p.id} piece={p} focus={focus} />
          ))}
          {routed
            .filter((r) => r.link.text)
            .map((r) => (
              <Tag key={r.link.id} x={r.tag[0]} y={r.tag[1]} link={r.link} focus={focus} />
            ))}
          {over}
        </svg>
      </div>
    </div>
  )
}
