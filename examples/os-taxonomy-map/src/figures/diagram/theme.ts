import { DEFAULT_THEME, type TLTheme } from 'tldraw'

// tldraw theme matched to src/styles/tokens.css, so the baked SVG sits in
// the article like the rest of the figures: page fonts (no embedded font
// faces; the export strips @font-face and the article already loads these
// families), thinner strokes, and fills mixed toward the figure
// background instead of tldraw's near-black dark-mode fills.
//
// Dev-only: this module is imported by the editor chunk, never by readers.

const LIGHT = { bg: '#ffffff', text: '#1a1a2e', text2: '#4a4a6a', accent: '#2563eb' }
const DARK = { bg: '#22223a', text: '#e8e6dd', text2: '#a0a0b4', accent: '#60a5fa' }

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const ca = p(a)
  const cb = p(b)
  if (ca.some(Number.isNaN) || cb.some(Number.isNaN)) return a
  return `#${ca
    .map((v, i) => Math.round(v * (1 - t) + cb[i] * t).toString(16).padStart(2, '0'))
    .join('')}`
}

type Palette = TLTheme['colors']['light']
type Mode = typeof LIGHT

function tune(colors: Palette, m: Mode, fillMix: number): Palette {
  // Shape colors are objects with solid/semi/fill/…; UI colors are strings.
  const out = { ...colors } as Record<string, unknown>
  for (const [name, value] of Object.entries(colors)) {
    if (!value || typeof value !== 'object') continue
    const c = { ...(value as unknown as Record<string, string>) }
    if (name === 'black') c.solid = m.text
    if (name === 'grey') c.solid = m.text2
    if (name === 'blue') c.solid = m.accent
    c.semi = mix(c.solid, m.bg, fillMix)
    c.fill = c.solid
    out[name] = c
  }
  out.background = m.bg
  out.text = m.text
  // tldraw's `semi` fill paints with this UI color: keep it at the figure
  // background (a hair lighter in dark mode) so plain boxes read as cards,
  // not black slabs. Colored kinds use the `solid` fill, i.e. c.semi above.
  out.solid = m === DARK ? mix(m.bg, '#ffffff', 0.04) : m.bg
  return out as Palette
}

const SANS = "'Source Sans 3', system-ui, sans-serif"

export const ARTICLE_THEME: TLTheme = {
  ...DEFAULT_THEME,
  fontSize: 15,
  strokeWidth: 1.25,
  fonts: {
    ...DEFAULT_THEME.fonts,
    // `draw` keeps tldraw's hand-drawn face for sketches; everything the
    // spec creates uses `sans`.
    sans: { fontFamily: SANS },
    serif: { fontFamily: "'Source Serif 4', Georgia, serif" },
    mono: { fontFamily: "'Source Code Pro', ui-monospace, monospace" },
  },
  colors: {
    light: tune(DEFAULT_THEME.colors.light, LIGHT, 0.88),
    dark: tune(DEFAULT_THEME.colors.dark, DARK, 0.78),
  },
}

// Must be referentially stable: passing a fresh object to <Tldraw themes>
// remounts the editor and re-runs onMount.
export const THEMES = { default: ARTICLE_THEME }
