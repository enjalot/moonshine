---
name: article
description: HTML scaffold, CSS foundation, article layout patterns, and series structure for moonshine explanations
---

# Article Structure

How moonshine explanations are built as self-contained HTML files. This covers the scaffold template, CSS foundation, layout patterns, and series structure.

## Tech Stack

Self-contained HTML, vanilla JS, D3 v7 from CDN. No build tools, no frameworks. Open the file in a browser and it works.

## Output Location

```
~/.agent/moonshine/project-name/
  index.html          # Self-contained explanation (HTML + CSS + JS)
  data/               # Optional external datasets
```

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
.figure-caption { font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2); margin-top: 0.75rem; }
.figure-label { font-weight: 600; color: var(--text); }

.insight { background: var(--accent-light); border-left: 3px solid var(--accent); padding: 1rem 1.25rem; margin: 1.5rem 0; border-radius: 0 4px 4px 0; }
.insight p { margin: 0; }

.margin-note { font-size: 0.8125rem; color: var(--text-2); line-height: 1.4; border-left: 2px solid var(--border); padding-left: 0.75rem; margin: 1rem 0; }

.controls { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; font-family: var(--heading-font); font-size: 0.85rem; color: var(--text-2); }
.controls input[type="range"] { width: 160px; accent-color: var(--accent); }

svg text { font-family: var(--heading-font); }
svg .axis text { font-size: 11px; fill: var(--text-2); }
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
- `--accent` / `--accent-light`: interactive elements, highlights, insight boxes
- `--bg` / `--fig-bg` / `--border`: backgrounds and structure

**Dark mode** (add when appropriate):
```css
@media (prefers-color-scheme: dark) {
  :root { --text: #e8e6dd; --text-2: #a0a0b4; --bg: #1a1a2e;
    --fig-bg: #22223a; --border: #3a3a52; --accent: #60a5fa; }
}
```

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

## Article Series

When a concept is too large for one article, break it into a series. Each piece should stand alone but benefit from the others.

**Index page:** The index is itself an article. It has introductory prose that frames the series, not just a list of links. After the prose, a card list links to individual articles.

Each card needs:
- A title
- A one-sentence description of what the reader will learn
- Optionally, tags noting visualization techniques used
- A thumbnail: either a small inline SVG abstracting the article's main chart (a simplified silhouette of a streamgraph, a heatmap grid, a small force layout) or a miniature of the actual figure. Thumbnails go to the left or top of the card, kept small (80-120px).

The index should have a small visual element in the header (sparkline, small chart) that gives a sense of the dataset.

**Card pattern:**
```html
<div class="card-list" style="display: flex; flex-direction: column; gap: 1rem; margin: 2rem 0;">
  <a class="card" href="01-first-concept.html" style="display: block; background: var(--fig-bg); border: 1px solid var(--border); border-radius: 6px; padding: 1.25rem 1.5rem; text-decoration: none; transition: border-color 0.15s;">
    <div style="font-family: var(--mono-font); font-size: 0.8rem; color: var(--text-2);">01</div>
    <div style="font-family: var(--heading-font); font-weight: 700; font-size: 1.2rem; color: var(--text); margin-bottom: 0.4rem;">Article Title</div>
    <p style="font-size: 0.95rem; color: var(--text-2); margin: 0;">One sentence about what the reader will learn.</p>
    <div style="font-family: var(--heading-font); font-size: 0.75rem; color: var(--accent); margin-top: 0.6rem;">scatter plot &middot; brushing &middot; linked views</div>
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

Redraw on resize rather than using `viewBox` for any chart with readable text. `viewBox` shrinks 14px text to 7px at half width.

**Pitfall:** ResizeObserver infinite loop. If chart content changes container height, observer fires again. Fix: observe a wrapper with CSS-determined size. Set `overflow: hidden` on the wrapper.

Touch: always use `pointerenter`/`pointerleave` over `mouseenter`/`mouseleave`. Pointer events unify mouse, touch, and pen.
