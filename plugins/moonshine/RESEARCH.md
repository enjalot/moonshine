# Moonshine Research

A living document of inspiration, analysis, and direction for interactive technical explanations.

## Key Ideas from Distill's "Research Debt"

Distill.pub's foundational essay argues that the scientific community undervalues **research distillation** — the work of making ideas accessible. Key claims:

- **Research debt** accumulates when ideas are published but not clearly explained. Each reader must independently reconstruct the author's understanding, duplicating effort thousands of times over.
- **Distillation is creative work.** It requires finding the right analogy, the right visualization, the right ordering of ideas. It is not summarization — it is re-invention of the explanation.
- **Good explanations are a public good** with enormous leverage: one excellent explanation saves thousands of hours of confused reading.
- **The medium matters.** Static text and figures are often insufficient. Interactive media can let readers explore parameter spaces, test intuitions, and build mental models that text cannot convey.
- **Research distillers deserve recognition** as contributors to the field, not merely popularizers.

### Implications for Moonshine

- We should treat each interactive explanation as a creative artifact, not a template fill-in
- The skill should push users toward the hard work of finding the right analogy and progression, not just wrapping text in interactivity
- Every interactive element must earn its place by enabling understanding that prose alone cannot achieve

## Distill Framework Analysis

### Original Distill Stack

Distill articles used:
- **Web Components** for encapsulation of interactive figures
- **Svelte** (later articles) for reactive UI within figures
- **Rollup** for bundling
- Custom **distill-template** for article layout, citations, margin notes, hover references
- Heavy use of **D3** for data visualization
- LaTeX-like citation and bibliography system

### What Worked Well

- **Consistent article template** — readers knew what to expect (title, abstract, body, appendix, citations)
- **Margin notes** over footnotes — keeps supplementary info visible without disrupting flow
- **Reactive figures** — parameters that update visualizations in real time
- **Hover cross-references** — hover a term to see its definition, hover a citation to see the reference
- **Consistent visual language** within an article — all figures share scales, colors, conventions

### Modernization with React + Vite

| Distill Original | Moonshine Approach |
|-----------------|-------------------|
| Web Components | React components with clear prop interfaces |
| Svelte reactivity | React hooks + useState/useEffect |
| Rollup | Vite (fast dev server, optimized builds) |
| Custom template | Composable React components (Article, Section, Figure, Prose) |
| D3 bindmings | D3 for computation + React for rendering, d3-power-tools patterns |
| BibTeX citations | Structured data + React citation components |

### Key Differences

- React's component model is more widely understood than Web Components, lowering the contribution barrier
- Vite's HMR makes iterating on interactive figures much faster than Rollup rebuilds
- TypeScript gives us type safety for data schemas and component props
- React context provides a clean way to share state across linked visualizations (replaces Distill's manual event wiring)

## Design Principles Catalog

### Information Hierarchy

Three levels, always present, always distinguishable:

1. **Primary narrative** — the main argument, in large body text, always visible
2. **Supporting detail** — definitions, examples, asides — in margin notes, expandable blocks, or lighter type
3. **Technical depth** — proofs, derivations, implementation details — in appendices, collapsible sections, or linked notebooks

**Implementation:** Use font size, weight, color, and spatial position (center column vs. margin) to make the hierarchy self-evident.

### Visual Encoding Principles

From Bertin, Cleveland & McGill, and Munzner:

- **Position on a common scale** — most accurate channel for quantitative data
- **Length** — second most accurate
- **Angle/slope** — less accurate but useful for showing trends
- **Area** — poor for precise comparison, fine for rough magnitude
- **Color hue** — categorical only (not ordered)
- **Color saturation/lightness** — can encode ordinal/quantitative, but with limited resolution
- **Redundant encoding** — use two channels for the same variable to improve accessibility and clarity

### Color for Data Visualization

- Use perceptually uniform color scales (viridis, cividis, or custom Lab/HCL scales via d3-interpolate)
- Ensure sufficient contrast against the figure background
- Test with simulated color vision deficiency (deuteranopia, protanopia)
- Default to sequential single-hue scales; use diverging scales only when there's a meaningful midpoint
- Categorical palettes: max 7-8 distinct colors; beyond that, use another encoding channel

### Typography for Technical Content

- Body: serif font, 18-20px, line-height 1.5-1.6, max-width 720px (60-75 characters per line)
- Headings: sans-serif, clear size/weight hierarchy
- Code: monospace, slightly smaller, with syntax highlighting
- Math: proper math rendering (KaTeX for performance)
- Margin notes: smaller (13px), secondary color, aligned to the relevant body text

## Interaction Pattern Library

### Details-on-Demand

**What:** Supplementary information revealed by hover, click, or focus.
**When:** The detail would clutter the main narrative but some readers need it.
**Examples:**
- Hover a data point to see its exact values
- Click a term to expand its definition inline
- Hover a citation to preview the reference

**Implementation:** React state + conditional rendering or CSS `:hover`. Use `aria-` attributes for accessibility.

### Explorable Explanations (Bret Victor)

**What:** Interactive controls that let the reader manipulate parameters and see results.
**When:** The concept involves a parameter space and intuition comes from exploring it.
**Examples:**
- Slider controls learning rate; plot shows convergence behavior
- Drag a point on a curve; equation updates to match
- Toggle assumptions on/off; see how conclusions change

**Implementation:** Controlled React inputs (range, number) with shared state via context. D3 scales map parameter values to visual positions.

### Linked Visualizations (Brushing & Linking)

**What:** Multiple views of the same data that highlight corresponding elements together.
**When:** Different representations reveal different aspects of the same phenomenon.
**Examples:**
- Scatterplot + histogram: brush a region in the scatter to see its distribution in the histogram
- Map + timeline: select a time range to filter map markers
- 2D projection + feature table: hover a point to highlight its row

**Implementation:** Shared state in React context. Each visualization reads/writes a `selection` or `highlight` field. D3 handles the visual updates.

### Scroll-Driven Narrative (Scrollytelling)

**What:** Visualizations that transform as the reader scrolls through the narrative.
**When:** The explanation has a natural sequence and visual continuity between steps matters.
**Examples:**
- A chart that starts simple and adds layers of complexity as the reader progresses
- An animation that plays as the reader scrolls past it
- Annotations that appear at the right moment in the reading

**Implementation:** Intersection Observer API (via `useIntersection` hook) to detect which section is active. D3 transitions between states. `position: sticky` for the visualization container.

### Animated Transitions

**What:** Smooth interpolation between visual states.
**When:** The path between two states is meaningful (not just decorative).
**Examples:**
- Morphing from a bar chart to a pie chart to show they represent the same data
- Interpolating between two distributions to show how a parameter affects shape
- Object constancy — tracking the same data point across chart transformations

**Implementation:** D3 transitions with `.transition().duration()`. Use `key` props carefully for React reconciliation. Consider `requestAnimationFrame` for custom animations.

## Ideas for React Component Library

### Core Components (build these first)

- `<Article>` — outer container, provides scroll context and shared state
- `<Section>` — content block with intersection observer registration
- `<Figure>` — figure container with caption, optional margin note, responsive sizing
- `<Prose>` — rich text block with proper article typography
- `<MarginNote>` — side note positioned alongside relevant content

### Interactive Primitives (build as needed)

- `<Slider>` — labeled range input with value display, linked to shared state
- `<Toggle>` — binary choice that changes a visualization parameter
- `<HoverRegion>` — area that triggers details-on-demand
- `<LinkedHighlight>` — text or element that highlights corresponding elements in visualizations
- `<ScrollySection>` — sticky visualization with scroll-triggered state changes

### Visualization Components (via d3-power-tools or custom)

- `<Axis>` — D3 axis rendered in React
- `<LinePlot>` — line chart with animated transitions
- `<ScatterPlot>` — scatterplot with brushing support
- `<Histogram>` — binned distribution with linked highlighting
- `<AnimatedPath>` — SVG path that interpolates between datasets

### Utility Hooks

- `useScrollProgress()` — returns 0-1 progress through the article or a section
- `useIntersection(ref)` — returns whether an element is in the viewport
- `useLinkedState(key)` — read/write shared state for linked visualizations
- `useD3(ref, renderFn, deps)` — safely run D3 operations on a ref when deps change
- `useAnimatedValue(target, duration)` — smoothly interpolate a number over time

## Open Questions and Future Directions

### Open Questions

- **Responsive figures:** How should interactive figures adapt to mobile? Simplify interaction (tap instead of hover)? Provide a static fallback? Reflow the layout?
- **Accessibility:** Distill articles were not particularly accessible. How do we make interactive figures work with screen readers? ARIA live regions for updated values? Sonification?
- **Print/export:** Should there be a static export path for PDF? How do you capture the essence of an interactive explanation in a static medium?
- **Collaboration:** Could multiple authors work on different sections/figures simultaneously? How does that affect the shared state design?
- **Performance:** For heavy D3 visualizations, when should we use canvas instead of SVG? What's the threshold?
- **Citations and references:** What's the right lightweight citation system for React? BibTeX parsing? DOI resolution?

### Future Directions

- **Component library package** — extract reusable components into an npm package
- **CLI scaffolding** — `npx create-moonshine` to generate a new explanation project
- **Gallery** — collect published explanations as examples and inspiration
- **Collaborative editing** — real-time co-authoring with shared state sync
- **Notebook integration** — bridge between Jupyter/Observable exploration and published explanation
- **AI-assisted distillation** — use Claude to help draft prose, suggest visualizations, and identify where interaction would help most

## References

### Distill.pub

- "Research Debt" — the foundational essay on why distillation matters
- "Attention and Augmented Recurrent Neural Networks" — exemplar of linked visualizations and scroll-driven narrative
- "Feature Visualization" — masterclass in progressive disclosure and information hierarchy
- "The Distill Template" — their article framework and design system
- "Circuits" thread — collaborative, heavily visual explanations of neural network internals

### Tools and Libraries

- **d3-power-tools** — reusable D3 patterns (see companion skill)
- **D3.js** — data visualization primitives
- **React 18** — component model and hooks
- **Vite** — build tooling and dev server
- **KaTeX** — fast math rendering
- **Intersection Observer API** — scroll-based triggers

### Inspirations Beyond Distill

- **Bret Victor, "Explorable Explanations"** — the original vision for interactive documents
- **Mike Bostock, Observable** — reactive notebooks for data exploration
- **3Blue1Brown** — visual mathematical explanations (animation-first approach)
- **Nicky Case** — playful interactive explanations of complex systems
- **Bartosz Ciechanowski** — long-form interactive explanations with physics simulations
- **The Pudding** — data-driven visual essays

### Related Skills

- **grill-me** — guided question-asking to help users clarify their thinking and communication goals
- **d3-power-tools** — reusable D3 visualization components and patterns
