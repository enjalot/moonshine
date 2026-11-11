---
name: article
description: HTML scaffold, CSS foundation, article layout patterns, and series structure for shine (single-file) moonshine explanations
---

# Article Structure (shine)

How **shine** explanations are built as self-contained HTML files. This covers the scaffold template, CSS foundation, layout patterns, and series structure — all of it shine-specific. In a **still** project the equivalents live in the template: palette and type stack in `src/styles/tokens.css`, state coordination in the Zustand store, and the series index generated from Velite (see `STILL.md`). The one part still authors may still consult here is the design sensibility, not the mechanisms.

## Tech Stack

Self-contained HTML, vanilla JS, D3 v7 from CDN. No build tools, no frameworks. Open the file in a browser and it works.

## Output Location

```
~/.agent/moonshine/project-name/
  index.html          # Self-contained explanation (HTML + CSS + JS)
  data/               # Only for data too large to inline (see below)
```

Inline data under about 100 KB so the page works when opened from disk. Larger or shared data goes in `data/` and is loaded with the scaffold's `loadJSON`, which reports a failed or `file://` fetch inside the figure that needed it. `VISUALS.md` "External Data" has the rules.

For article series:

```
~/.agent/moonshine/project-name/
  index.html          # Series index with intro prose and article cards
  01-first-concept.html
  02-second-concept.html
  data/               # Shared datasets
```

## HTML Scaffold

Every moonshine explanation starts from this template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Explanation Title</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400&family=Source+Sans+3:wght@400;600;700&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --article-width: 740px;
  --body-font: 'Source Serif 4', Georgia, serif;
  --heading-font: 'Source Sans 3', system-ui, sans-serif;
  --mono-font: 'Source Code Pro', monospace;
  --body-size: 1.125rem;
  --line-height: 1.6;
  --text: #1a1a2e;
  --text-2: #4a4a6a;
  --accent: #2563eb;
  --accent-light: #dbeafe;
  --bg: #fafafa;
  --fig-bg: #ffffff;
  --border: #e2e2e8;
  --fig-text: 13px;        /* floor for anything readable inside a figure */
}

@media (prefers-color-scheme: dark) {
  :root {
    --text: #e8e6dd; --text-2: #a0a0b4; --accent: #60a5fa; --accent-light: #1e3a5f;
    --bg: #1a1a2e; --fig-bg: #22223a; --border: #3a3a52;
  }
}

body {
  font-family: var(--body-font);
  font-size: var(--body-size);
  line-height: var(--line-height);
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

.article { max-width: var(--article-width); margin: 0 auto; padding: 2rem 1.25rem 6rem; }
h1, h2, h3 { font-family: var(--heading-font); font-weight: 700; line-height: 1.2; }
h1 { font-size: 2.5rem; margin: 0 0 0.5rem; }
h2 { font-size: 1.5rem; margin: 3rem 0 1rem; }
h3 { font-size: 1.15rem; margin: 2rem 0 0.75rem; }
p { margin: 0 0 1rem; }
a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }

.figure { margin: 2rem 0; padding: 1.5rem; background: var(--fig-bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.figure-wide { margin-left: -2rem; margin-right: -2rem; }
.figure svg, .figure canvas { display: block; max-width: 100%; }
.figure-caption { font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2); margin-top: 0.75rem; }
.figure-label { font-weight: 600; color: var(--text); }

.margin-note { font-size: 0.8125rem; color: var(--text-2); line-height: 1.4; border-left: 2px solid var(--border); padding-left: 0.75rem; margin: 1rem 0; }

.controls { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2); }
.controls input[type="range"] { width: 160px; accent-color: var(--accent); }

.readout { font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2); min-height: 1.6em; margin-top: 0.5rem; }
.figure-msg { font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2); padding: 1rem 0; }
pre, .eq-block { overflow-x: auto; }

/* No font-size here: a stylesheet rule would override .attr("font-size"). */
svg text { font-family: var(--heading-font); fill: var(--text); }
svg .axis text { font-size: var(--fig-text); fill: var(--text-2); }
svg .axis line, svg .axis path { stroke: var(--border); }

@media (max-width: 640px) {
  h1 { font-size: 1.75rem; }
  .figure-wide { margin-left: 0; margin-right: 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
}
</style>
</head>
<body>
<div class="article">
  <header>
    <h1>Title</h1>
    <p style="font-family: var(--heading-font); font-size: 1.15rem; color: var(--text-2);">
      A clear one-sentence description of what the reader will understand.
    </p>
  </header>

  <!-- Sections go here, each an h2 with prose and figures -->

  <footer style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border); font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2);">
    <p>Built with <a href="https://github.com/enjalot/moonshine" style="color: var(--text-2);">moonshine</a>.</p>
  </footer>
</div>

<script>
// State coordination
const state = {};
const dispatch = d3.dispatch('update', 'select', 'hover');

// --- Scaffold helpers. Keep these identical in every file of a series. ---

// Theme: canvas, WebGL and library colour arguments cannot use var(--x).
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Seeded random numbers, so a figure shows the same thing its caption describes.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// figure(id, draw): calls draw(el, width) at the container's real pixel width,
// and again on resize or colour-scheme change. Lay out in pixels inside draw;
// do not set a fixed viewBox, or text shrinks with the column.
function figure(id, draw) {
  const el = document.getElementById(id);
  let last = 0;
  const run = () => { const w = Math.round(el.clientWidth); if (w > 0) { last = w; draw(el, w); } };
  new ResizeObserver(() => { if (Math.round(el.clientWidth) !== last) run(); }).observe(el);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', run);
  run();
}

// visibleLoop(el, frame): runs frame(dt) only while el is on screen and the
// tab is visible. Under reduced motion it does not start; draw a still and
// offer a Play button that calls the returned start().
function visibleLoop(el, frame) {
  let raf = 0, onScreen = false, wanted = !reducedMotion.matches, prev = 0;
  const tick = t => { frame(Math.min(50, t - prev)); prev = t; raf = requestAnimationFrame(tick); };
  const sync = () => {
    const go = wanted && onScreen && !document.hidden;
    if (go && !raf) { prev = performance.now(); raf = requestAnimationFrame(tick); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(el);
  document.addEventListener('visibilitychange', sync);
  return { start() { wanted = true; sync(); }, stop() { wanted = false; sync(); } };
}

// loadJSON(url, el, label): a failed, blocked or file:// request becomes a
// sentence in the figure that needed the data, never a blank box.
async function loadJSON(url, el, label) {
  const msg = d3.select(el).append('p').attr('class', 'figure-msg').text(`Loading ${label}…`);
  try {
    if (location.protocol === 'file:') throw new Error('file');
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    msg.remove();
    return data;
  } catch (err) {
    msg.text(location.protocol === 'file:'
      ? `This figure loads ${label}, which a browser blocks for a page opened from disk. Serve this folder over HTTP to see it.`
      : `Couldn't load ${label}.`);
    return null;
  }
}

// All visualization code in IIFEs to avoid globals
</script>
</body>
</html>
```

## CSS Foundation

The template uses CSS custom properties throughout. Reference them in D3 code via `"var(--text)"` in SVG style attributes. Never hardcode colors the palette already defines.

**Type stack:**
- `--body-font` (Source Serif 4): article prose, long-form reading
- `--heading-font` (Source Sans 3): headings, UI elements, figure captions, SVG text, controls
- `--mono-font` (Source Code Pro): inline code, data values

**Color palette:**
- `--text` / `--text-2`: primary and secondary text
- `--accent` / `--accent-light`: interactive elements and highlights
- `--bg` / `--fig-bg` / `--border`: backgrounds and structure

**Dark mode** is part of the scaffold, not an option. Every colour in a figure comes from a custom property: in SVG as `var(--x)`, in canvas via `cssVar("--x")` with a redraw on scheme change (`figure()` does the redraw). Semantic colours an article adds (one per variable in an equation, say) get a dark value in the same media block, and KaTeX colours are pointed at those properties after render instead of using `\color{#hex}`. Check the page in both schemes before delivering.

**Figure text** is `var(--fig-text)` (13px) or larger. The scaffold sets no `font-size` on `svg text` because a stylesheet rule overrides `.attr("font-size", …)`; set sizes with `.style()` or a class.

## Layout Patterns

**Wide figures:** Use `.figure-wide` (negative horizontal margins) to let data-dense visualizations break out of the 740px article column. This gives important charts more room without changing the reading width of prose.

**Sparklines in headers:** A small inline chart (60-80px wide) in the article header gives the reader an immediate visual hook before reading starts. Use for the article's primary dataset when it has a natural shape (time series, distribution).

**Figure captions:** Every figure gets a caption. Format: `<span class="figure-label">Figure N.</span>` followed by a description of what the reader should notice, not just what the chart shows. The caption is editorial judgment, not alt text.

**Margin notes:** Use `.margin-note` for supplementary context that would interrupt the main narrative as a parenthetical.

**Scroll-driven layout:** For scrollytelling, the figure stays sticky while text scrolls alongside:
```css
.scroll-container { display: flex; gap: 2rem; }
.scroll-figure { position: sticky; top: 2rem; flex: 1; height: fit-content; }
.scroll-steps { flex: 1; }
.step { min-height: 60vh; padding: 2rem 0; }
```

**Math rendering:** Use KaTeX (`https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js` + CSS) for equations. Render with `katex.render(expression, element)` for display math or `katex.renderToString(expression)` for inline.

**Hover cross-references:** When a term or variable appears in prose, hovering it can highlight the corresponding element in a nearby figure. Implement with data attributes (`data-ref="variable-name"`) and a shared hover event that both the text and the figure listen to.

**Equations and code:** When pairing an equation with pseudocode, always stack vertically (equation above, code below). Never side by side. Equations are typically wider than they are tall, so horizontal space is the constraint. Color-code variables in the equation and use matching colors in the pseudocode so the reader can trace the connection.

**Light-mode code blocks:** Use a light background for code so that color-coded variables (matching equation colors) remain readable. Dark code themes clash with colored inline variables.

**Dynamic value displays:** When showing live values that update on hover or interaction (like equation variables resolving to numbers), always reserve fixed height for the display area. Values appearing and disappearing causes layout jitter. Use `min-height` or a placeholder value.

**Viewport-aware simulations:** Simulations and animations should only run when scrolled into view and the tab is visible. Use the scaffold's `visibleLoop`. This saves battery on mobile and prevents background simulations from competing for CPU/GPU with the figure the reader is actually looking at. Under `prefers-reduced-motion` the loop does not start: run the simulation forward a few hundred steps without drawing, draw that still, and add a Play button.

## Article Series

When a concept is too large for one article, break it into a series. Each piece should stand alone but benefit from the others.

**Index page:** The index is itself an article. It has introductory prose that frames the series, not just a list of links. After the prose, a card list links to individual articles.

Each card needs:
- A title
- A one-sentence description of what the reader will learn
- Optionally, tags noting visualization techniques used
- A thumbnail: a small static miniature of the chapter's main figure, drawn from that chapter's real data, not a decorative stand-in (a sine wave for "embeddings"). Static means no animation loop per card. Thumbnails go to the left or top of the card, kept small (80-120px), and where the layout hides them (a phone) their data is not downloaded.

Card titles say what the chapter covers. A metaphor ("The Lens") can sit in a kicker line above a plain title.

The index should have a small visual element in the header (sparkline, small chart) that gives a sense of the dataset.

**Card pattern:**
```html
<div class="card-list" style="display: flex; flex-direction: column; gap: 1rem; margin: 2rem 0;">
  <a class="card" href="01-first-concept.html" style="display: block; background: var(--fig-bg); border: 1px solid var(--border); border-radius: 6px; padding: 1.25rem 1.5rem; text-decoration: none; transition: border-color 0.15s;">
    <div style="font-family: var(--mono-font); font-size: 0.8125rem; color: var(--text-2);">01</div>
    <div style="font-family: var(--heading-font); font-weight: 700; font-size: 1.2rem; color: var(--text); margin-bottom: 0.4rem;">Article Title</div>
    <p style="font-size: 0.95rem; color: var(--text-2); margin: 0;">One sentence about what the reader will learn.</p>
    <div style="font-family: var(--heading-font); font-size: 0.8125rem; color: var(--accent); margin-top: 0.6rem;">scatter plot &middot; brushing &middot; linked views</div>
  </a>
</div>
```

**Footer navigation:** Individual articles in a series include a back-link to the series index in the footer, alongside attribution and data credits. The footer is where the reader lands after finishing, so it's the natural place for "back to index" or "next article" links.

```html
<footer style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border); font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2);">
  <p>Part of <a href="index.html" style="color: var(--text-2);">Series Title</a>. Next: <a href="02-next.html" style="color: var(--accent);">Next Article</a>.</p>
  <p>Data from ... Built with <a href="https://github.com/enjalot/moonshine" style="color: var(--text-2);">moonshine</a>.</p>
</footer>
```

**One stylesheet and one set of helpers for the whole series.** Each file is self-contained, so the shared `<style>` block and the scaffold helpers are copied into every chapter, and copies drift: shipped series ended up with opposite colour conventions between chapters and seven variants of the same CSS. Keep the shared blocks byte-identical (generate the files from one template with a small script kept beside the project, or diff the shared blocks across files before delivering), and keep conventions the same across chapters: one colour per variable, one meaning for each ramp, the same footer wording.

**A series keeps its promises.** If chapter 1 says "we will return to these measures", a named later chapter computes them. The capstone computes something (the methods side by side on one dataset, scored), not only a hand-rated summary table; a table of judgments is labelled as judgment.

## State Coordination

Cross-chart communication without a framework. `d3.dispatch` is the event bus; a shared state object is the source of truth.

```js
const dispatch = d3.dispatch("select", "hover", "filter");
const state = { selected: new Set(), hovered: null, param: 0.5 };

// Chart A listens
dispatch.on("select.chartA", keys => {
  state.selected = new Set(keys);
  renderChartA();
});

// Chart B emits
brushGroup.on("brush end", event => {
  if (!event.selection) return;
  const keys = data.filter(d => inBrush(d, event.selection)).map(d => d.id);
  dispatch.call("select", null, keys);
});
```

For deeper state (zoom + filter + sort + brush), use a store:

```js
function createStore(init) {
  let s = { ...init };
  const subs = new Set();
  return {
    get: () => s,
    set(u) { s = { ...s, ...u }; for (const fn of subs) fn(s); },
    sub(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
```

**Pitfall:** Feedback loops. Chart A updates state, state triggers Chart A redraw, which re-emits. Fix: pass a `source` parameter and skip if the event originated from this chart.

## Responsive

Observe container size, not window. Redraw on resize with new dimensions.

```js
const container = document.getElementById("fig-1");
const ro = new ResizeObserver(([entry]) => {
  const { width } = entry.contentRect;
  if (width > 0) render(width);
});
ro.observe(container);
```

Redraw on resize rather than using `viewBox` for any chart with readable text. `viewBox` shrinks 14px text to 7px at half width, and to 4px on a phone. The scaffold's `figure(id, draw)` is this pattern packaged: write `draw(el, width)` to clear `el` and lay everything out in pixels for that width (`const svg = d3.select(el).html("").append("svg").attr("width", width).attr("height", h)`), and branch on width for the narrow layout (`const cols = width < 480 ? 1 : 3`). Bind control listeners outside `draw`, or they double up on every redraw.

**Pitfall:** ResizeObserver infinite loop. If chart content changes container height, observer fires again. Fix: observe a wrapper with CSS-determined size. Set `overflow: hidden` on the wrapper.

Touch: always use `pointerenter`/`pointerleave` over `mouseenter`/`mouseleave`. Pointer events unify mouse, touch, and pen. That is the start of touch support, not the whole of it: see "Phones and touch" in `VISUALS.md` for scrolling past figures, drag handles, pan/zoom and hover-only values.
