---
name: visuals
description: D3 v7 visualization patterns for interactive technical explanations
---

# Visuals

D3 v7 visualization patterns for moonshine explanations. For the HTML scaffold, CSS foundation, and article layout, see `ARTICLE.md`.

D3 owns the DOM. No framework abstraction layer. Use `.join()` for data binding, `selection.call()` for reusable chart functions, `d3.dispatch` for cross-chart communication (see State Coordination in `ARTICLE.md`). Load D3 from CDN: `https://d3js.org/d3.v7.min.js`.

Use CSS custom properties from the article scaffold (`var(--text)`, `var(--accent)`, etc.) in SVG style attributes. Never hardcode colors the palette already defines.

## Rendering Technology

Choose the technology that fits each figure. Start with SVG and only switch when you have a reason to.

**SVG** is the default for most explanatory figures. Crisp text, CSS styling, accessibility, DOM-based interaction. Works well under ~2,000 elements.

**Canvas 2D** for dense data (2K-100K points), real-time animation, or pixel-level effects. Requires manual hit detection (quadtree for hover) and loses DOM accessibility without extra work.

**WebGL** for massive datasets (100K+) or GPU-computed effects. High setup cost. Use only when Canvas can't keep up.

**HTML + CSS** for tables, icon arrays, text-heavy layouts, and simple progress indicators. Underrated. A well-styled HTML table is a visualization.

**Hybrid** Canvas for the data layer, SVG for axes and labels, HTML for controls and tooltips. Often the right answer for complex figures.

**Libraries:** D3 v7 is the primary tool. Use additional libraries when they're the right fit: d3-sankey for Sankey diagrams, topojson-client for geographic data, KaTeX for math. Load from CDN. Prefer fewer dependencies.

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

**Judgment:** One slider per parameter. Checkboxes for on/off toggles. Radio buttons for mutually exclusive modes. Keep controls inside the `.figure` container, above the chart.

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
  circles.attr("fill", d => isActive(d) ? color(d.cat) : "#ddd")
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

`d3.drag` on SVG elements. Constrain to axis or bounds, dispatch parameter change.

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

Grid of rects, `scaleBand` for both axes. Color: `scaleSequential` + `interpolateBlues` or `interpolateViridis`. Add cell labels when grid is coarse (cells > 30px).

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

### Color

Sequential: `interpolateBlues` (single hue) or `interpolateViridis` (multi-hue, colorblind-safe). Diverging: `scaleDiverging` with meaningful midpoint. Categorical: `schemeTableau10` (up to 10). Colorblind-safe: Tableau10, viridis, Tol Bright.

WCAG contrast: 4.5:1 minimum for text against background.

### Annotation

Direct labeling beats legends for 5 or fewer series. Leader lines connect data point to label. Reference lines for thresholds (dashed, lighter than data). Force-based label placement to avoid overlap: pre-compute with `simulation.stop(); simulation.tick(120)`.

**Judgment:** Annotate the surprising, not the obvious. 1-3 callouts per chart maximum.

### Typography in SVG

`text-anchor` for horizontal alignment. `dy="0.35em"` to vertically center. `<tspan>` for multi-line. `<foreignObject>` for HTML content (equations, styled text).

Font: use `var(--heading-font)` for all SVG text. Body font is for article prose, not chart labels.

**Math rendering:** KaTeX from CDN for equations. `katex.render(expression, element)` for display, `katex.renderToString(expression)` for inline.

**Hover cross-references:** When a term in prose is hovered, highlight the corresponding element in a figure. Implement with `data-ref` attributes and shared hover events.

**Pitfall:** `getComputedTextLength()` returns 0 if text is not yet in the DOM. Append first, then measure. For pre-layout measurement, use [pretext](https://github.com/chenglou/pretext) which computes text metrics from font tables directly.

## Data

### Inline Data

For explanations, embed data directly as JS arrays or objects. No external fetches. The explanation must work offline. For synthetic data, use a seeded random number generator for reproducibility.

### Transformations

Group, aggregate, bin, sort, normalize, pivot. Use D3's built-in: `d3.group`, `d3.rollup`, `d3.bin`, `d3.stack`, `d3.hierarchy`, etc.

### Generated Data

When explaining a concept (not a dataset), generate synthetic data that demonstrates the concept clearly. Design the data to show the pattern. The data is in service of the explanation.

## Iteration

Generating a visualization in one pass often produces something that works but doesn't communicate well. Refine in passes:

1. **Structure** Get the data, encoding, and layout right. Does the visualization type match the data question? Are scales and color correct?
2. **Legibility** Can the reader identify values? Do labels fit? Is the palette accessible?
3. **Interaction** Does this interaction build intuition that prose alone can't? Is it discoverable? Does it work on touch?
4. **Narrative** Does an annotation highlight the key insight? Is the caption informative? Does the visual flow match the article's progression?
5. **Stress** What happens at extreme values? During rapid interaction? At narrow widths (400px)? With `prefers-reduced-motion`?

When an article has multiple figures, iterate across them: consistent color encoding, consistent scales where comparison matters, linked interactions that don't loop, and a visual progression that matches the narrative arc.

## Performance

**Budget:** 16ms per frame (60fps). SVG limit: ~2,000 elements. Canvas limit: ~100,000 elements. WebGL beyond that.

**Dirty-flag rendering:** Track which layers changed, redraw only those. Coalesce rapid events with requestAnimationFrame.

**Pre-computation:** Run expensive layouts (force simulation, label placement) synchronously before first render.

## Accessibility

Keyboard navigation via Tab/Arrow keys. ARIA labels on figures. Hidden data table as fallback for complex charts. Respect `prefers-reduced-motion` (instant state changes, not duration 0). Every figure needs a caption describing what the reader should notice.
