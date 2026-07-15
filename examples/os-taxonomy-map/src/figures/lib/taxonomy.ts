import { useEffect, useState } from 'react'

// Shared data + canvas helpers for the three taxonomy figures.
//
// The 1,590-topic dataset ships as a static JSON in public/. It's ~800KB,
// so we load it once (module-level promise cache) and every figure that
// calls useTaxonomy() shares the same parsed structures — projected
// coordinates, the prerequisite adjacency, cluster centroids.

export type Pt = {
  i: number
  name: string
  x: number
  y: number
  subject: string
  domain: string
  a0: number
  a1: number
  cluster: number
  centrality: number
  desc: string
  type: string
}

export type Edge = { t: number; p: number; hard: boolean; reason: string }
export type Cluster = { id: number; label: string; cx: number; cy: number; n: number }

export type Taxonomy = {
  pts: Pt[]
  edges: Edge[]
  clusters: Cluster[]
  prereqsOf: Edge[][]
  dependentsOf: Edge[][]
  byName: Map<string, Pt>
}

// Categorical subject colors are fixed (they encode identity, not a scale)
// so they stay put across light and dark mode. Text/halo colors, which do
// need to flip with the theme, come from CSS variables via themeColors().
export const SUBJECT_COLOR: Record<string, string> = {
  Mathematics: '#4269d0',
  Science: '#3ca951',
  English: '#efb118',
  History: '#9c6b4e',
  'Personal & Social Development': '#ff8ab7',
  'Life Skills': '#ff725c',
  Computing: '#a463f2',
  'Learning to Learn': '#6cc5b0',
}
export const SUBJECTS = Object.keys(SUBJECT_COLOR)
export const GRAY = '#c9c9d4'

let cache: Promise<Taxonomy> | null = null

function build(T: any): Taxonomy {
  const pts: Pt[] = T.points.map((p: any[], i: number) => ({
    i,
    name: p[0],
    x: p[1],
    y: p[2],
    subject: p[3],
    domain: p[4],
    a0: p[5],
    a1: p[6],
    cluster: p[7],
    centrality: p[8],
    desc: p[9],
    type: p[10],
  }))
  const edges: Edge[] = T.edges.map((e: any[]) => ({
    t: e[0],
    p: e[1],
    hard: e[2] === 1,
    reason: e[3],
  }))
  const prereqsOf: Edge[][] = pts.map(() => [])
  const dependentsOf: Edge[][] = pts.map(() => [])
  edges.forEach((e) => {
    prereqsOf[e.t].push(e)
    dependentsOf[e.p].push(e)
  })
  const clusters: Cluster[] = T.clusters.map((c: any[]) => ({
    id: c[0],
    label: c[1],
    cx: c[2],
    cy: c[3],
    n: c[4],
  }))
  const byName = new Map(pts.map((p) => [p.name, p]))
  return { pts, edges, clusters, prereqsOf, dependentsOf, byName }
}

function load(): Promise<Taxonomy> {
  if (!cache) {
    cache = fetch(import.meta.env.BASE_URL + 'taxonomy.json')
      .then((r) => r.json())
      .then(build)
  }
  return cache
}

export function useTaxonomy(): Taxonomy | null {
  const [data, setData] = useState<Taxonomy | null>(null)
  useEffect(() => {
    let alive = true
    load().then((d) => alive && setData(d))
    return () => {
      alive = false
    }
  }, [])
  return data
}

// ---- projection + canvas helpers ------------------------------------

export type View = { cx: number; cy: number; k: number }

// Data domain is roughly [-1.1, 1.1]^2; project into a square-ish canvas.
// Mirrors the shine article's makeCanvas so the layouts read identically.
export function px(x: number, view: View, W: number, H: number): number {
  return (x - view.cx) * view.k * (Math.min(W, H) / 2.3) + W / 2
}
export function py(y: number, view: View, W: number, H: number): number {
  return (view.cy - y) * view.k * (Math.min(W, H) / 2.3) + H / 2
}

export type Theme = { text: string; text2: string; halo: string }

// Resolve the theme-dependent ink colors from CSS variables so canvas
// text stays legible in dark mode (where the shine article's hardcoded
// #1a1a2e halos would vanish). The halo is the figure background, drawn
// under label text as a soft outline.
export function themeColors(el: Element): Theme {
  const s = getComputedStyle(el)
  const figBg = s.getPropertyValue('--fig-bg').trim() || '#ffffff'
  return {
    text: s.getPropertyValue('--text').trim() || '#1a1a2e',
    text2: s.getPropertyValue('--text-2').trim() || '#4a4a6a',
    halo: figBg,
  }
}

export function drawHaloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number
    weight?: number
    color?: string
    align?: CanvasTextAlign
    halo?: string
  } = {},
): void {
  const { size = 12, weight = 600, color = '#1a1a2e', align = 'center', halo } = opts
  ctx.font = `${weight} ${size}px 'Source Sans 3', sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = halo ? withAlpha(halo, 0.9) : 'rgba(255,255,255,0.9)'
  ctx.lineJoin = 'round'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

// Best-effort alpha wash for a hex or rgb() color, used for text halos.
function withAlpha(color: string, a: number): string {
  const h = color.replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    const n = parseInt(h, 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
  }
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    const r = parseInt(h[0] + h[0], 16)
    const g = parseInt(h[1] + h[1], 16)
    const b = parseInt(h[2] + h[2], 16)
    return `rgba(${r},${g},${b},${a})`
  }
  return color
}

// A resolution-aware square canvas bound to a wrapper element. Returns the
// 2D context and a resize() that syncs the backing store to devicePixelRatio.
export function makeCanvas(wrapEl: HTMLElement, aspect = 0.92) {
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.display = 'block'
  wrapEl.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  let W = 0
  let H = 0
  function resize(): boolean {
    const w = wrapEl.clientWidth
    if (!w) return false
    const h = Math.round(w * aspect)
    const dpr = window.devicePixelRatio || 1
    W = w
    H = h
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return true
  }
  resize()
  return {
    canvas,
    ctx,
    resize,
    get w() {
      return W
    },
    get h() {
      return H
    },
  }
}

export const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
