import type { ReactNode } from 'react'
import baked from 'virtual:moonshine-icons'
import { redrawDiagrams } from './text'

// Glyphs for tile nodes (a SpecNode with `icon`). Each stands for a KIND of
// thing: every service is the same cube, every database the same cylinder,
// and two of a kind differ by their label.
//
// One grammar, so glyphs from different sources sit together: drawn in a
// 24-unit box centred on 0,0; outlines in the current colour over a pale
// wash of it (.mn-dg-glyph), inner detail as lines with no fill
// (.mn-dg-glyph-line); round joins. No fragments and no React keys inside:
// these are drawn by Dragology.
//
// An article adds its own with registerGlyphs({ name: <g>…</g> }) from a
// figure file. Prefer a product's real icons, redrawn in this grammar, to
// generic ones.

const line = 'mn-dg-glyph-line'

const GLYPHS: Record<string, ReactNode> = {
  person: (
    <g>
      <circle cx={0} cy={-4.5} r={4} />
      <path d="M-8,9.5 Q-8,1.5 0,1.5 Q8,1.5 8,9.5 Z" />
    </g>
  ),
  service: (
    <g>
      <path d="M0,-9.5 L8.4,-4.75 V4.75 L0,9.5 L-8.4,4.75 V-4.75 Z" />
      <path className={line} d="M-8.4,-4.75 L0,0 L8.4,-4.75 M0,0 V9.5" />
    </g>
  ),
  database: (
    <g>
      <path d="M-8,-5.5 V5.5 A8,3.2 0 0 0 8,5.5 V-5.5" />
      <ellipse cx={0} cy={-5.5} rx={8} ry={3.2} />
      <path className={line} d="M-8,0 A8,3.2 0 0 0 8,0" />
    </g>
  ),
  store: (
    <g>
      <path d="M-8.5,-6 L-6,8.5 H6 L8.5,-6 Z" />
      <path className={line} d="M-9.5,-6 H9.5" />
    </g>
  ),
  queue: (
    <g>
      <rect x={-10} y={-5} width={5.5} height={10} rx={1.2} />
      <rect x={-2.75} y={-5} width={5.5} height={10} rx={1.2} />
      <rect x={4.5} y={-5} width={5.5} height={10} rx={1.2} />
    </g>
  ),
  document: (
    <g>
      <path d="M-6.5,-9.5 H2.5 L7,-5 V9.5 H-6.5 Z" />
      <path className={line} d="M2.5,-9.5 V-5 H7 M-3,0.5 H3.5 M-3,4.5 H3.5" />
    </g>
  ),
  function: (
    <g>
      <rect x={-9} y={-9} width={18} height={18} rx={3} />
      <path className={line} d="M3.5,-5 Q0.5,-6 0,-2.5 L-1,3.5 Q-1.5,6.5 -4,5.5 M-3,-1 H3" />
    </g>
  ),
  key: (
    <g>
      <circle cx={-4.5} cy={0} r={4.5} />
      <path className={line} d="M0,0 H9.5 M6,0 V3.5 M9.5,0 V3" />
    </g>
  ),
  browser: (
    <g>
      <rect x={-10} y={-8} width={20} height={16} rx={2.5} />
      <path className={line} d="M-10,-3.5 H10 M-7,-5.75 H-6.5 M-4.5,-5.75 H-4" />
    </g>
  ),
  cloud: (
    <g>
      <path d="M-6,7 A4.5,4.5 0 0 1 -6.5,-2 A6,6 0 0 1 5,-3.5 A5.2,5.2 0 0 1 6,7 Z" />
    </g>
  ),
  folder: (
    <g>
      <path d="M-9.5,-7 H-3 L-0.5,-4 H9.5 V7.5 H-9.5 Z" />
      <path className={line} d="M-9.5,-1 H9.5" />
    </g>
  ),
  gear: (
    <g>
      <path d="M-2,-10 H2 L2.8,-7.2 L5.6,-8.4 L8.4,-5.6 L7.2,-2.8 L10,-2 V2 L7.2,2.8 L8.4,5.6 L5.6,8.4 L2.8,7.2 L2,10 H-2 L-2.8,7.2 L-5.6,8.4 L-8.4,5.6 L-7.2,2.8 L-10,2 V-2 L-7.2,-2.8 L-8.4,-5.6 L-5.6,-8.4 L-2.8,-7.2 Z" />
      <circle className={line} cx={0} cy={0} r={3} />
    </g>
  ),
  clock: (
    <g>
      <circle cx={0} cy={0} r={9.5} />
      <path className={line} d="M0,-5.5 V0 L4,2.5" />
    </g>
  ),
  bolt: (
    <g>
      <path d="M2,-10 L-7,1.5 H-0.5 L-2,10 L7,-1.5 H0.5 Z" />
    </g>
  ),
}

export function registerGlyphs(more: Record<string, ReactNode>) {
  Object.assign(GLYPHS, more)
}

export const glyphNames = () => Object.keys(GLYPHS)

// ---- Tabler icons (`tabler:<name>`) --------------------------------------
// The ones the article uses are bundled (vite-plugin-moonshine-icons). In
// dev, one picked in the editor a moment ago is fetched and the diagrams
// redraw when it arrives.
const tabler = new Map<string, string[] | null>(Object.entries(baked))
const pending = new Set<string>()

export function cacheTabler(name: string, paths: string[]) {
  tabler.set(name, paths)
}

function tablerPaths(name: string): string[] | null {
  const hit = tabler.get(name)
  if (hit !== undefined) return hit
  if (import.meta.env.DEV && !pending.has(name)) {
    pending.add(name)
    fetch(`/__moonshine/icons/tabler/${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { paths?: string[] } | null) => {
        tabler.set(name, d?.paths ?? null)
        redrawDiagrams()
      })
      .catch(() => tabler.set(name, null))
  }
  return null
}

// Tabler draws in a 0..24 box; ours is centred on 0,0. One path, so the
// drawing has a fixed shape whatever the icon.
const tablerGlyph = (paths: string[]) => (
  <g>
    <path className={line} transform="translate(-12,-12)" d={paths.join(' ')} />
  </g>
)

// Anything that is not a glyph name is drawn as written: an emoji, or a
// letter or two.
const textGlyph = (text: string) => (
  <g>
    <text className="mn-dg-glyph-text" textAnchor="middle" dominantBaseline="central">
      {text}
    </text>
  </g>
)

export function glyph(name: string | undefined): ReactNode {
  if (!name) return null
  if (name in GLYPHS) return GLYPHS[name]
  if (name.startsWith('tabler:')) {
    const paths = tablerPaths(name.slice(7))
    return paths ? tablerGlyph(paths) : null
  }
  return textGlyph(name)
}

// A glyph on its own, for a legend or beside a word in the prose:
//   <Glyph name="database" size={18} tone="data" />
export function Glyph({ name, size = 18, tone, title }: { name: string; size?: number; tone?: string; title?: string }) {
  return (
    <svg
      className="mn-dg-glyph-inline"
      data-tone={tone}
      viewBox="-12 -12 24 24"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className="mn-dg-glyph">{glyph(name)}</g>
    </svg>
  )
}
