---
name: visuals
description: Visualization patterns for interactive technical explanations, on either substrate
---

# Visuals

Visualization patterns for moonshine explanations on either substrate. For the shine HTML scaffold, CSS foundation, and article layout, see `ARTICLE.md`; for the still project structure, see `STILL.md`.

D3 owns the DOM. No framework abstraction layer. Use `.join()` for data binding and `selection.call()` for reusable chart functions.

**In a shine article** (single HTML file): load D3 from CDN (`https://d3js.org/d3.v7.min.js`), coordinate figures with `d3.dispatch` (see State Coordination in `ARTICLE.md`), and cross-reference prose to figures with `data-ref` hover events (see Hover cross-references below).

**In a still project** (Vite + React): D3 and KaTeX are npm dependencies already in the template — never inject CDN script tags. Give D3 its DOM inside a figure component via `useRef` + `useEffect` and treat that element as D3-owned (see `STILL.md`). Prose-to-figure highlighting is the `:term` directive plus the Zustand store, not `data-ref` events, and cross-figure state goes through the store, not `d3.dispatch`. Everything else in this file — rendering technology, interaction, encoding, annotation — applies unchanged.

Use CSS custom properties from the article scaffold (`var(--text)`, `var(--accent)`, etc.) in SVG style attributes. Never hardcode colors the palette already defines. Every article has a dark scheme, so a colour literal in figure code (`"#ddd"`, `"white"`, `hsl(220,14%,…)`) is a figure that breaks for half its readers. See "Colour and theme" under Polish.

The snippets below are written as vanilla D3 with `dispatch`, which is how a shine page wires them. In a still figure the same pattern holds with the store or component state in place of `dispatch`; for anything a reader drags, start from the template's `src/figures/drag/README.md` instead of `d3.drag`.

## Rendering Technology

Choose the technology that fits each figure. Start with SVG and only switch when you have a reason to.

**SVG** is the default for most explanatory figures. Crisp text, CSS styling, accessibility, DOM-based interaction. Works well under ~2,000 elements.

**Canvas 2D** for dense data (2K-100K points), real-time animation, or pixel-level effects. Requires manual hit detection (quadtree for hover) and loses DOM accessibility without extra work: give the `<canvas>` `role="img"` and an `aria-label` that describes what it currently shows.

**Pitfall:** Canvas ignores CSS variables. `ctx.strokeStyle = "var(--accent)"` fails silently and the stroke stays black. Read the computed value and redraw when the scheme changes:

```js
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let theme = { text: cssVar("--text"), accent: cssVar("--accent") };
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  theme = { text: cssVar("--text"), accent: cssVar("--accent") };
  draw();
});
```

The same applies to WebGL uniforms and to KaTeX `\color{#hex}`: define the colour as a custom property with a dark value and read it.

**WebGL** for massive datasets (100K+) or GPU-computed effects. High setup cost. Use only when Canvas can't keep up.

**WebGPU** only when the article is about GPU computation, and always with a CPU fallback that the figure labels ("running on CPU"). Test both paths: headless Chromium has `navigator.gpu` and no adapter by default, so a default screenshot only ever exercises the fallback (`--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan` gives a real adapter on a machine with a GPU). Do not request limits you don't need, since `requiredLimits` above a phone's maximum pushes a capable phone onto the fallback. In a readback, capture buffer sizes before the `await`, because the particle count may have grown by the time the map resolves. Log `device.onuncapturederror` and never swallow exceptions in the frame loop: a swallowed GPU error looks to the reader like a frozen figure.

**HTML + CSS** for tables, icon arrays, text-heavy layouts, and simple progress indicators. Underrated. A well-styled HTML table is a visualization.

**Hybrid** Canvas for the data layer, SVG for axes and labels, HTML for controls and tooltips. Often the right answer for complex figures.

**Libraries:** D3 v7 is the primary tool. Use additional libraries when they're the right fit: d3-sankey for Sankey diagrams, topojson-client for geographic data, KaTeX for math. In shine, load from CDN; in still, add them as npm dependencies. Prefer fewer dependencies either way.

**Judgment:** The explanation's job is to communicate, not to benchmark. Switch to Canvas only when you hit a performance wall you can feel.

## Interaction

### Controls

HTML controls (sliders, checkboxes, buttons) linked to shared state via dispatch.

```js
const slider = document.getElementById("param-slider");
const valSpan = document.getElementById("param-val");
slider.addEventListener("input", () => {
  state.param = +slider.value;
  valSpan.textContent = state.param;
  dispatch.call("filter", null, state);
});
```

**Judgment:** One slider per parameter. Checkboxes for on/off toggles. Radio buttons for mutually exclusive modes. Keep controls inside the `.figure` container, above the chart. Offer only the settings that exist: if five projections were precomputed, show five buttons, not two dropdowns with nine combinations.

**Pitfall:** Binding listeners inside a function that redraws. A figure that redraws on resize and calls `addEventListener` each time fires every handler twice after the first resize. Bind once outside the draw function, or assign `slider.oninput = …`.

**Pitfall:** Using `change` instead of `input` on range sliders. `change` fires only on release; `input` fires continuously during drag for live feedback.

### Hover & Tooltips

Positioned HTML div, not SVG `<title>`. Show on `pointerenter`, hide on `pointerleave`, position near cursor and clamp to viewport.

```js
const tip = d3.select("body").append("div")
    .attr("class", "tip")
    .style("position", "fixed").style("pointer-events", "none").style("opacity", 0);

selection
  .on("pointerenter", (event, d) => {
    tip.html(`<strong>${d.name}</strong>: ${d.value}`).style("opacity", 1);
  })
  .on("pointermove", event => {
    const tw = tip.node().offsetWidth;
    const x = Math.min(event.clientX + 12, window.innerWidth - tw - 8);
    const y = Math.max(event.clientY - 32, 8);
    tip.style("left", `${x}px`).style("top", `${y}px`);
  })
  .on("pointerleave", () => tip.style("opacity", 0));
```

For sparse point charts, use Voronoi overlay so the hover target is the nearest point, not the point itself:

```js
const delaunay = d3.Delaunay.from(data, d => xScale(d.x), d => yScale(d.y));
svg.append("rect").attr("width", w).attr("height", h)
    .attr("fill", "none").attr("pointer-events", "all")
    .on("pointermove", event => {
      const [mx, my] = d3.pointer(event);
      const i = delaunay.find(mx, my);
      // highlight data[i], show tooltip at its position
    });
```

**Pitfall:** Positioning tooltip with `pageX`/`pageY` while using `position: fixed`. Use `clientX`/`clientY` for fixed positioning, `pageX`/`pageY` for absolute.

**Judgment:** A touch screen has no hover. If the argument needs a value, do not put it in a tooltip. Show it in a readout (HTML, below the figure, with reserved height) that starts on a default selection, and let hover, tap and arrow keys all move the selection. Tooltips are for detail a reader can do without.

### Brushing & Selection

`d3.brush` for 2D, `d3.brushX`/`d3.brushY` for single axis. Selection drives data filter, dispatches to linked views.

```js
const brush = d3.brushX()
    .extent([[0, 0], [innerWidth, innerHeight]])
    .on("brush end", event => {
      if (!event.selection) { dispatch.call("select", null, []); return; }
      const [x0, x1] = event.selection.map(xScale.invert);
      const keys = data.filter(d => d.value >= x0 && d.value <= x1).map(d => d.id);
      dispatch.call("select", null, keys);
    });
g.append("g").call(brush);
```

Ghost/active pattern: draw the full dataset in light gray (background), then the selected subset in accent color (foreground).

```js
dispatch.on("select.chart", keys => {
  const sel = new Set(keys);
  const isActive = d => sel.size === 0 || sel.has(d.id);
  circles.attr("fill", d => isActive(d) ? color(d.cat) : "var(--border)")
         .attr("opacity", d => isActive(d) ? 0.85 : 0.15);
});
```

**Pitfall:** Brush coordinates are pixels. After resize, they map to wrong data values. Convert to data domain before resize, restore after.

### Scroll-Driven Narrative

Sticky figure with scrolling text steps. IntersectionObserver detects which step is active; step index drives figure state.

```js
const steps = document.querySelectorAll(".step");
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) goToStep(+e.target.dataset.step);
  });
}, { threshold: 0.5 });
steps.forEach(el => observer.observe(el));

const stages = [showOverview, splitByGroup, highlightOutliers];
function goToStep(i) { stages[i](); }
```

**Judgment:** Step-based (discrete triggers) for most explanations. Progress-based (continuous scroll percentage) only when properties should scrub smoothly (e.g., rotating a 3D view).

**Pitfall:** goToStep must be idempotent. When scrolling backward, the chart must transition correctly from any state to the target step, not only from the previous step.

### Drag

`d3.drag` on SVG elements. Constrain to axis or bounds, dispatch parameter change. (In a still project, prefer declarative dragging: see `src/figures/drag/README.md` in the template. It gives snapping, detents, reordering and drop animation from a one-line spec, and lets readers drag outputs as well as inputs.)

```js
const drag = d3.drag()
    .on("drag", (event, d) => {
      d.x = Math.max(0, Math.min(width, event.x));
      d3.select(event.sourceEvent.target).attr("cx", d.x);
      dispatch.call("filter", null, { threshold: xScale.invert(d.x) });
    });
handle.call(drag);
```

**Pitfall:** Forgetting to set `cursor: grab` on the draggable and `cursor: grabbing` during drag. Without visual cues, users don't discover the interaction.

**Pitfall:** Attaching `d3.drag` (or `d3.zoom`) to a whole SVG. On a phone the figure then swallows every swipe and the reader cannot scroll past it. Attach drag to the handle, set `touch-action: none` on the handle only, and see "Phones and touch" below.

**Pitfall:** Hover information stopping during drag. If a figure supports both hover (showing values) and drag (moving elements), both should work simultaneously. Don't let drag suppress hover updates.

## Motion

### Transitions

Use `.transition().duration(ms)` on selections. Key functions for object constancy so elements track identity across data updates.

```js
svg.selectAll("circle")
  .data(data, d => d.id)
  .join(
    enter => enter.append("circle")
        .attr("r", 0).attr("cx", d => x(d.x)).attr("cy", d => y(d.y))
      .call(e => e.transition().duration(500).attr("r", d => r(d.val))),
    update => update.call(u => u.transition().duration(500)
        .attr("cx", d => x(d.x)).attr("cy", d => y(d.y))),
    exit => exit.call(e => e.transition().duration(300).attr("r", 0).remove())
  );
```

Interrupt previous transitions before starting new ones: `selection.interrupt()`.

Easing: `easeCubicOut` for responsive UI (fast start, gentle stop). `easeLinear` for continuous data playback. `easeCubicInOut` for smooth position changes.

**Pitfall:** Animating from undefined. If an element has no initial position, the transition starts from 0,0. Always set initial attributes in the enter callback before transitioning.

**Pitfall:** Demonstrations that move too fast. When a probe particle moves through a field or an animation shows cause-and-effect, the reader needs time to see the response. Err on the side of too slow. A demonstration that takes 3 seconds to play teaches more than one that finishes in 0.5 seconds.

### Choreography

Sequence multi-stage transitions. Coordinated delays are more robust than `transition.end()` promises (which reject on interruption or empty selections).

```js
function staged(data) {
  const joined = svg.selectAll(".bar").data(data, d => d.id);
  const exitDur = 300, moveDur = 400, enterDur = 400;
  const moveDelay = joined.exit().empty() ? 0 : exitDur;
  joined.join(
    enter => enter.append("rect").attr("class", "bar")
        .attr("y", height).attr("height", 0)
      .call(e => e.transition().delay(moveDelay + moveDur).duration(enterDur)
        .attr("y", d => y(d.val)).attr("height", d => height - y(d.val))),
    update => update.call(u => u.transition().delay(moveDelay).duration(moveDur)
        .attr("y", d => y(d.val))),
    exit => exit.call(e => e.transition().duration(exitDur)
        .attr("height", 0).attr("y", height).remove())
  );
}
```

Stagger with delay: `.delay((d, i) => i * 30)`. Keep total stagger under 500ms.

### Shape Morphing

Parametric morphs for shapes that share parameters (circle to rect via cornerRadius, bar to arc via angle/radius). Point resampling for shapes that differ in topology: resample both to 128 evenly-spaced points, interpolate per frame.

**Judgment:** Morphing should prove equivalence ("this bar chart and this pie chart show the same data"). Don't morph between unrelated states for spectacle.

**Pitfall:** `d3.interpolateString` on SVG path `d` attributes produces garbage when paths have different commands. Always use parametric interpolation or point resampling.

## Charts

### Line & Area

```js
const line = d3.line().x(d => x(d.date)).y(d => y(d.val))
    .defined(d => d.val != null)
    .curve(d3.curveBasis);
```

Curve types: `curveBasis` for smooth, `curveStep` for discrete, `curveLinear` (default) for connecting points. `curveMonotoneX` for sparklines (no overshoot).

Multi-series: group data, one `<path>` per group. Confidence bands: area between `y0(d => y(d.lower))` and `y1(d => y(d.upper))`.

**Pitfall:** Missing `.defined()` on line generators. Without it, null values draw to (0,0).

### Bar & Histogram

Vertical bars: `scaleBand` for x, `scaleLinear` for y. Horizontal: swap axes. Grouped: nested `scaleBand`. Stacked: `d3.stack()`. Histogram: `d3.bin()` to bucket continuous data.

**Pitfall:** Bar charts must include zero in the y-domain.

### Scatter & Bubble

Both axes `scaleLinear`. Size encoding: `scaleSqrt` for area perception, not `scaleLinear` on radius. Jitter for overlapping points. Density contours for very dense data: `d3.contourDensity()`.

**Pitfall:** Using `scaleLinear` for bubble radius. The eye reads area, not radius. `scaleSqrt` handles this.

### Heatmap & Matrix

Grid of rects, `scaleBand` for both axes. Color: `scaleSequential` with a theme-aware ramp (see Colour and theme) or `interpolateViridis`. Add cell labels when grid is coarse (cells > 30px).

Adjacency matrix: nodes on both axes. Sort by cluster to reveal community structure as dense diagonal blocks.

### Network & Graph

Node-link: `d3.forceSimulation` with forces for link springs, charge repulsion, and centering. Chord: `d3.chord()` + `d3.ribbon()`. Sankey: `d3-sankey` (separate CDN import). Arc diagram: nodes on a line, links as curved arcs.

**Judgment:** Node-link for topology. Matrix for density. Chord for flow volumes. Sankey for quantities through a pipeline. Node-link becomes a hairball past ~500 nodes.

### Hierarchy

Build: `d3.hierarchy()` from nested data, `d3.stratify()` from flat id/parentId. Tree: `d3.tree()`. Treemap: `d3.treemap()`. Pack: `d3.pack()`. Sunburst: `d3.partition()` + `d3.arc()`.

**Judgment:** Treemap for size comparison. Tree for tracing paths. Pack for grouping. Sunburst for full hierarchy with depth.

### Distributions

Box plot: quartiles, whiskers, outlier dots. Violin: `d3.bin()` to build density, mirror as area. Bee swarm: `d3.forceSimulation` with `forceX` + `forceCollide`, pre-compute with `.stop(); .tick(120)`. Ridgeline: stacked area charts offset vertically.

**Judgment:** Box plot hides bimodality. Violin shows shape but hides individuals. Bee swarm shows every point but degrades past ~500 per group.

### Small Multiples

Grid of the same chart repeated across categories. Shared scales (compute domains from full dataset before per-panel loop). Only draw y-axis on leftmost column, x-axis on bottom row.

**Pitfall:** Creating scales inside the per-panel loop accidentally produces independent scales.

### Sparklines

Tiny line charts (60-80px wide, 20px tall). No axes. `curveMonotoneX` for no overshoot. End dot for current value. Shared y-domains when sparklines sit side by side.

## Polish

### Scales & Axes

`scaleLinear` (default quantitative), `scaleLog` (spans 2+ orders, strictly positive), `scaleSqrt` (area encoding), `scaleBand` (categorical), `scaleUtc` (temporal).

Responsive ticks: `ticks(Math.max(2, innerWidth / 80))`. Label collision: reduce tick count first, truncate, stagger, rotate as last resort.

**Pitfall:** `.nice()` on bar charts can push the lower bound below zero.

### Colour and theme

Sequential: a ramp from the figure background to the accent (`d3.interpolateRgb(cssVar("--fig-bg"), cssVar("--accent"))`, or the accent at varying opacity), or `interpolateViridis` (multi-hue, colorblind-safe). Avoid `interpolateBlues`, `interpolateGreys` and other ramps that start near white: their low end vanishes on a light figure and glares on a dark one, and the encoding inverts between schemes. Diverging: `scaleDiverging` with meaningful midpoint. Categorical: `schemeTableau10` (up to 10), skipping pale pastels that disappear against either background. Colorblind-safe: Tableau10, viridis, Tol Bright.

Every colour a figure uses is a custom property with a light and a dark value. SVG can use `var(--x)` directly; canvas, WebGL and library colour arguments read it with `getComputedStyle` (see the Canvas pitfall above) and redraw when the scheme changes. Module-level caches of rendered pixels (a heatmap image computed once) must be keyed by scheme or they keep the first scheme's colours.

WCAG contrast: 4.5:1 minimum for text against background, in both schemes.

### Annotation

Direct labeling beats legends for 5 or fewer series. Leader lines connect data point to label. Reference lines for thresholds (dashed, lighter than data). Force-based label placement to avoid overlap: pre-compute with `simulation.stop(); simulation.tick(120)`.

**Judgment:** Annotate the surprising, not the obvious. 1-3 callouts per chart maximum.

### Typography in SVG

`text-anchor` for horizontal alignment. `dy="0.35em"` to vertically center. `<tspan>` for multi-line. `<foreignObject>` for HTML content (equations, styled text).

Font: use `var(--heading-font)` for all SVG text. Body font is for article prose, not chart labels. Size: 13px minimum as rendered, which rules out scaling a fixed `viewBox` (see Phones and touch).

**Pitfall:** A stylesheet rule beats a presentation attribute. With `svg text { font-size: 11px }` in the page CSS, `.attr("font-size", 14)` does nothing. Set sizes with `.style("font-size", …)` or a class.

**Math rendering:** In shine, KaTeX from CDN — `katex.render(expression, element)` for display, `katex.renderToString(expression)` for inline. In still, write `$$` / `$` in the markdown (remark-math + rehype-katex, bundled from npm); inside a figure component, import katex directly.

**Hover cross-references (shine):** When a term in prose is hovered, highlight the corresponding element in a figure. Implement with `data-ref` attributes and shared hover events. In still this mechanism already exists as the `:term` directive — use that, don't build a parallel one.

**Pitfall:** `getComputedTextLength()` returns 0 if text is not yet in the DOM. Append first, then measure. For pre-layout measurement, use [pretext](https://github.com/chenglou/pretext) which computes text metrics from font tables directly.

## Data

### Inline Data

Embed data directly as JS arrays or objects when it is small (under about 100 KB). The page then works opened from disk. For synthetic data, always use a seeded random number generator (`mulberry32` is in the shine scaffold), never `Math.random`: an unseeded figure cannot be checked against its caption, because the caption was written about a different draw.

### External Data

Above that size, or when several chapters share a file, load it. Then:

- **State what the figure downloads.** Measure the bytes fetched before first paint and with no interaction, and keep them proportionate. A reader on a phone should not pay 20 MB to scroll past a map.
- **No figure waits on a file it doesn't need.** If the first figure needs 36 KB of fixtures, it must not sit blank behind a 2 MB embeddings file that only the third figure uses. Split files by which figure needs them.
- **Don't fetch what the current input can't use.** Hover captions load on first hover; animation frames load when animation is on; under `prefers-reduced-motion` or `Save-Data`, start on the still.
- **A failed fetch is reported in the figure.** Wrap loading so that a 404, a blocked request or a page opened from `file://` puts a sentence in the figure that needed the data ("Couldn't load jokes-1k.json (2.2 MB). Serve this folder over HTTP."). A blank box and an uncaught rejection is the default outcome otherwise.
- **Show that something is loading**, with the size: "Loading 53,000 points (2.4 MB)".

### Transformations

Group, aggregate, bin, sort, normalize, pivot. Use D3's built-in: `d3.group`, `d3.rollup`, `d3.bin`, `d3.stack`, `d3.hierarchy`, etc.

### Generated Data

When explaining a concept (not a dataset), generate synthetic data that demonstrates the concept clearly. Design the data to show the pattern. The data is in service of the explanation.

Designing the input is where this licence ends. What happens to the input is computed by the method the figure names, not drawn from a formula for what should happen (see Honest Figures in `SKILL.md`). Choose the input so the honest result is vivid: if rank-4 NMF only recovers the parts when samples omit parts at random, generate samples that way and say so.

## Iteration

Generating a visualization in one pass often produces something that works but doesn't communicate well. Refine in passes:

1. **Structure** Get the data, encoding, and layout right. Does the visualization type match the data question? Are scales and color correct?
2. **Legibility** Can the reader identify values? Do labels fit? Is the palette accessible?
3. **Interaction** Does this interaction build intuition that prose alone can't? Is it discoverable? Does it work on touch and from the keyboard (see Phones and touch, Accessibility)?
4. **Narrative** Does an annotation highlight the key insight? Is the caption informative? Does the visual flow match the article's progression?
5. **Stress** What happens at extreme values (cap sliders whose product can create 78,000 SVG nodes)? During rapid interaction? At 360px wide? In the dark scheme? With `prefers-reduced-motion`? After 30 seconds of running? When the data fails to load?

When an article has multiple figures, iterate across them: consistent color encoding, consistent scales where comparison matters, linked interactions that don't loop, and a visual progression that matches the narrative arc.

## Phones and touch

Most of the defects found in shipped moonshine articles were here. Check at 360px wide, by touch.

**Text is 13px or larger as rendered.** The usual cause of 4px labels is a fixed `viewBox="0 0 680 400"` scaled down to the column. Lay the figure out at its measured pixel width and redraw on resize (the shine scaffold's `figure()` helper, or a `ResizeObserver` in a still figure), so font sizes are real pixels. At narrow widths, change the layout instead of shrinking it: fewer ticks, panels stacked in one or two columns, labels moved below, fewer columns in a pipeline diagram. In still, `DragFigure` scales its drawing to the column, so give it a `narrow` layout or keep its labels in HTML around the drawing.

**Readouts and legends are HTML, outside the drawing.** They wrap, they stay 13px, and they can reserve height so the page doesn't jump.

**One finger scrolls the page.** A swipe that starts on a figure must scroll past it unless it starts on something draggable.
- Draggable handles: `touch-action: none` on the handle, not the figure. Make the hit target at least 32px even when the visible mark is smaller.
- Pan and zoom (`d3.zoom`, a map canvas): never `touch-action: none` on a tall figure. Two fingers pan and pinch, one finger scrolls the page, the wheel zooms only with ctrl/cmd held, and zoom in / out / reset buttons sit under the figure. With `d3.zoom` that is a `.filter()` that rejects one-finger touches and plain wheel events, plus `touch-action: pan-y`.
- A tap does what a click does, and what hover does when hover carries meaning.

**The opening view is readable at this width.** A map that fits 23,000 tiles into 360px opens as noise. Zoom the default view until the marks are legible (a tile at least about 14px), and let the reader zoom out.

**No horizontal page scroll.** Wide content (an equation, a code block, a table) scrolls inside its own box.

## Performance

**Budget:** 16ms per frame (60fps). SVG limit: ~2,000 elements. Canvas limit: ~100,000 elements. WebGL beyond that. A phone is several times slower than the machine the figure was built on: give simulations a time budget per frame (run substeps until about 12ms have passed, then draw) instead of a fixed substep count.

**Dirty-flag rendering:** Track which layers changed, redraw only those. Coalesce rapid events with requestAnimationFrame.

**Pre-computation:** Run expensive layouts (force simulation, label placement) synchronously before first render.

**Off-screen figures do nothing.** Start a `requestAnimationFrame` loop when the figure scrolls into view and stop it when it leaves or the tab is hidden (`IntersectionObserver` plus `visibilitychange`). A page with six simulations should be running one.

**Load weight** is part of performance: see External Data.

## Accessibility

**A text alternative on every figure.** `role="img"` and an `aria-label` on the SVG or canvas saying what it shows now (update it when the state changes), in addition to the caption. A hidden data table is a good fallback for a chart whose values matter.

**Keyboard access for interactions the argument depends on.** If the reader must move a point to see the idea, the point is focusable (`tabindex="0"`) and arrow keys move it. Controls are real `<button>`, `<input>` and `<select>` elements with labels, never clickable `<span>`s. Decorative interactions can stay pointer-only.

**Reduced motion.** `prefers-reduced-motion` must reach JavaScript animation, not only CSS transitions: a `requestAnimationFrame` loop ignores the scaffold's CSS rule. Under reduced motion, show a meaningful still (run the simulation forward off screen, then draw once) with a Play button, and make transitions between states instant.

**Captions** describe what the reader should notice, and a hint line says what can be done ("Drag the crest. Arrow keys also move it.").
