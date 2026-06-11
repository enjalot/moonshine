---
name: still
description: Opinionated Vite + React project structure for moonshine articles where prose lives in pristine markdown and figures are first-class React components
---

# Still: Structured Moonshine Articles

`/moonshine:still` is the opinionated counterpart to `/moonshine:shine`.
Where `shine` produces a self-contained HTML file you can email, `still`
scaffolds a Vite + React project where prose and figure code evolve
independently and the article can grow into something substantial.

Use `still` when:
- The article will keep being edited after first publication.
- Figures need React state, react-flow diagrams, or other component
  libraries that don't fit cleanly into a single HTML file.
- Multiple people may edit the prose without touching figure code.
- The work is a series, or could become one.

Use `shine` when:
- You're drafting fast or sharing a single HTML file.
- The article is one-shot and won't keep being edited.

The two share the editorial principles, anti-slop rules, type stack, and
palette from `SKILL.md`. Only the rendering substrate differs.

## Core Principle: The Markdown Stays Pristine

Writers never see JSX, `import` statements, or framework tags in their
`.md` files. Everything they need to express is either standard
CommonMark or one of three directive flavors. If you find yourself
wanting to write `<Component>` in markdown, stop and pull that into a
figure component instead.

## The Three Directives

Authors have exactly three things to learn:

```md
:::figure{id=loss-landscape}
Optional caption goes here as markdown.
:::

The :term[gradient]{to=gradient-field} of the loss points uphill.

Step size matters: too small :inline-viz{kind=mini-spark value=0.15}
and you stall.
```

**Container directive** (`:::name{}`...`:::`) — block-level. Used for
figures that take their own paragraph. The id matches an entry in the
figure registry. Inner content becomes the caption.

Math also works out of the box: `$\eta$` inline and `$$...$$` display
blocks render through remark-math + KaTeX (styles bundled from npm, no
CDN). It's standard markdown-math syntax, not a directive.

**Text directive — labeled** (`:name[label]{}`) — inline. Wraps a word
or phrase in prose. The most common use is `:term[word]{to=figure-id}`,
which makes the word a clickable button that highlights the linked
figure.

**Text directive — unlabeled** (`:name{}`) — also inline. The `[label]`
part is optional; when omitted, the directive renders as a stand-alone
inline element. Used for mid-paragraph visuals:
`:inline-viz{kind=mini-spark value=0.8}`. The `kind` attribute selects
which inline figure to render; all other attributes pass through as
props.

(There is also a `::name{}` leaf directive in remark-directive, but it
parses as a *block-level* element on its own line — not what you want
for an inline visual. Use the single-colon text directive form for
anything that should sit mid-paragraph.)

These come from `remark-directive`, which converts directives into AST
nodes our handler maps to dashed HTML tag names (`mn-figure`,
`mn-term`, `mn-inline-viz`). `react-markdown`'s `components` map then
renders those as React components.

## Interaction Model: Hover and Click

`<Term>` exposes two interactions:

- **Hover or focus** sets `hoveredTermRef` in the Zustand store. Linked
  figure gets a soft outline. No scrolling. The reader is just glancing.
- **Click** sets `pinnedTermRef`. Linked figure gets a strong outline
  and auto-scrolls into view. Clicking the same term again unpins;
  clicking a different term moves the pin; Escape clears it.

This two-tier model lets a reader skim with hover and commit with
click. It mirrors how Distill's `<dt-fn>` footnote chips work, and how
Bret Victor's *Tangle* highlights its bindings.

### Targeting parts of a figure

The `to` attribute uses dotted notation to target a specific element
WITHIN a figure, not just outline the whole figure:

```md
:term[gradient]{to=gradient-field.well}      → highlights the `well` part
:term[step size]{to=flow-diagram.update}     → highlights the `update` node
:term[loss]{to=loss-landscape}               → highlights the whole figure
```

A figure that wants part-level highlighting reads the store via
`useFigureHighlight('figure-id')` and inspects `activePart`:

```ts
const { activePart } = useFigureHighlight('flow-diagram')
// activePart === undefined → no term targets this figure
// activePart === null      → a term targets the whole figure (no .part)
// activePart === 'update'  → a term targets the `update` part
```

Figures that don't opt in just ignore the part suffix — the whole-figure
outline still fires. This is how `GradientField.tsx` (highlights a
cluster of arrows tagged `partId: 'well'`) and `FlowDiagram.tsx`
(highlights the React Flow node whose id matches `activePart`) work
in the template.

When designing a figure, pick part-ids that read naturally in prose:
`flow-diagram.update`, not `flow-diagram.node3`.

One constraint: figure ids must not contain `.` — the first dot in a
`to=` reference separates the figure id from the part id.

## File Layout

```
template/
  content/                   ← writers edit only here
    example.md
    series/
      index.md
      01-gradient-descent.md
      02-momentum.md
  src/
    main.tsx
    App.tsx                  ← routing: / and /:slug
    store.ts                 ← Zustand: hover + pinned state
    components/
      Article.tsx            ← renders one article
      SeriesIndex.tsx        ← renders the cards list
      Figure.tsx             ← container-directive handler
      Term.tsx               ← text-directive handler
      InlineViz.tsx          ← unlabeled text-directive handler
      LazyIsland.tsx         ← visibility-gated hydration wrapper
    lib/
      directive-handler.ts   ← remark plugin: maps directives to tags
    figures/
      registry.ts            ← id → {component, height, wide} map
      Sparkline.tsx          ← D3 example
      GradientField.tsx      ← plain SVG example
      LossLandscape.tsx      ← interactive React state example
      FlowDiagram.tsx        ← React Flow example
      lib/
        params.ts            ← attr→number/bool/string coercers
        lossSurface.ts       ← constants shared between figures
      inline/
        MiniSpark.tsx        ← inline visual example
    styles/
      tokens.css             ← shared palette + type stack
      article.css            ← article + figure + term styling
  velite.config.ts           ← schema for frontmatter; emits typed JSON
  vite.config.ts
  index.html
  package.json
```

## How a Figure Gets Added

Three steps, in this order:

1. Drop a React component file in `src/figures/`. It can use D3,
   React Flow, react-three-fiber, plain SVG, Canvas, WebGL — anything
   that fits in a React component. Default export, typed
   `(props: FigureProps)`.

2. Register it in `src/figures/registry.ts` under a stable id (no dots).
   Block figures go in `figures` as a metadata record:
   ```ts
   'your-new-figure': { component: YourFigure, height: 320, wide: true }
   ```
   `height` reserves vertical space before the figure lazily mounts (no
   layout shift, term-pin scroll lands correctly); `wide` breaks it out
   of the article column. Inline figures go in `inlineFigures`.

3. Reference the id in markdown:
   ```md
   :::figure{id=your-new-figure}:::
   ```

The writer never sees step 1 or 2.

### Parameters: DEFAULTS + markdown attributes

Every directive attribute passes to the component as a prop (always a
string), plus an injected `figureId` — use `useFigureHighlight(figureId)`
rather than hardcoding the id, so highlighting can't fall out of sync
with the registry key.

Expose each figure's tunable values as an exported `DEFAULTS` const at
the top of the file, and parse incoming attributes against it with the
helpers in `src/figures/lib/params.ts`:

```ts
export const DEFAULTS = {
  lr: 0.08,  // gradient-descent step size (η)
  steps: 80, // max iterations
}

export default function LossLandscape(props: FigureProps) {
  const lr = num(props.lr, DEFAULTS.lr)
  const steps = num(props.steps, DEFAULTS.steps)
  ...
}
```

This gives the author two tweak surfaces that both stay visible to the
agent: override per-instance in markdown
(`:::figure{id=loss-landscape lr=0.15}`), or edit the `DEFAULTS` block
in code. Never bury a tunable as a magic number in render logic — if it
shapes what the reader sees, it belongs in `DEFAULTS`. Constants shared
by several figures (like the loss surface both example figures depict)
go in `src/figures/lib/` so the figures can't drift apart.

## Recommended Visualization Libraries

The figure layer is open. But there are real choices to make per figure:

- **React Flow** is the preferred choice for node-link diagrams.
  Unlike Mermaid (which renders to opaque SVG you can't reach into),
  every React Flow node is a real React component. That means a clicked
  `:term[word]{to=diagram-id}` can subscribe to the same store and
  highlight a specific node *inside* the diagram. Choose React Flow
  whenever you'd reach for Mermaid.

- **D3 v7** for custom data visualization — scales, axes, force
  layouts, contours, anything where the existing `VISUALS.md`
  patterns apply. Inside a React component, treat the SVG element as
  D3-owned (use `useRef` + `useEffect`).

- **Plain SVG** for static diagrams or small interactive figures
  where D3 would be overkill. The `GradientField.tsx` example shows
  this pattern.

- **react-three-fiber** for 3D. Wrap heavy 3D figures in
  `<LazyIsland>` so they only boot when scrolled to.

- **Canvas / WebGL** when SVG element counts get past ~2,000.

- **Avoid Mermaid.** It's tempting because of the declarative syntax,
  but the output is opaque to your interaction model. Use React Flow
  instead.

## Velite and Typed Metadata

`velite.config.ts` defines a Zod-flavored schema for the frontmatter of
every article. At build time (and in watch mode during `npm run dev`),
Velite reads `content/**/*.md`, validates each file, and emits typed
JSON into `.velite/`. The app imports it as `articles` from `#content`.

What this buys you:

- **Series indexes.** The cards on the index page render off the
  typed `articles[]` array. Add a new article file, save it, the
  index updates. No manual list to keep in sync.
- **Prev/next navigation.** Derived once from `order`.
- **Validation.** A typo in `series:` or a missing `title:` fails the
  build with a clear error, not a runtime undefined.
- **Cross-references.** You can extend the schema to validate that
  every `:term[word]{to=foo}` references a figure id that actually
  exists. Catch typos at build time.

What it costs:

- A second watch process (Vite plus Velite, run via concurrently).
- One config file.
- ~15 MB of node_modules.

For a single throwaway article it's modest overkill, but it scales up
gracefully. The template ships with it configured.

## Live-Reload Story

Two independent pipelines run during `npm run dev`:

1. **Velite watcher** re-emits `.velite/index.js` on any change in
   `content/**/*.md`. Vite picks up the new module and re-renders the
   article without losing scroll position.

2. **Vite + React Fast Refresh** hot-swaps any change in `src/**`.
   Editing a figure component keeps the rest of the page mounted, so
   you can iterate on a visualization without losing the interaction
   state on neighboring figures.

Edits on either side don't disturb the other. This is why we don't use
MDX — MDX would re-bundle the whole article on any prose change.

## In-Place Prose Editing (dev only)

During `npm run dev` the author can edit prose directly in the rendered
page — no jumping back to the `.md` file for small wording changes.

- **Hold Cmd/Ctrl** to reveal editable block boundaries (a left rule
  appears on hover).
- **Cmd/Ctrl+click a block** (paragraph, heading, list, blockquote, or
  the title/lede) to open it. The rendered block is swapped for a
  textarea showing its *raw markdown* — directives like
  `:term[word]{to=fig}` and `:inline-viz{kind=…}` appear as source, so
  you edit exactly what's on disk.
- **Cmd/Ctrl+Enter** (or the floating **Done** button) writes the change
  back to the `.md` file; **Esc** cancels.

How it holds together:

- **Offsets, not DOM.** react-markdown hands each block component a hast
  `node` carrying `position.start.offset`/`end.offset` into the body
  string. Editing is a pure splice — `body.slice(0,start) + edited +
  body.slice(end)` — so a directive's source survives a round-trip
  untouched. We never serialize rendered HTML back to markdown.
- **Body vs frontmatter.** Body blocks splice into the markdown body;
  the title and lede patch the `title:`/`description:` frontmatter keys
  in place, leaving the rest of the frontmatter alone.
- **The write path.** `vite-plugin-moonshine-edit.ts` adds a
  `POST /__moonshine/save` middleware (`apply: 'serve'`) that preserves
  frontmatter and writes the file; Velite re-emits and the page
  hot-reloads. Velite's schema exposes a `path` field so the endpoint
  knows which file a block came from.
- **Static builds are inert.** Every affordance is gated on
  `import.meta.env.DEV`, which is `false` in `vite build`: no edit UI
  renders, and the `fetch` to the save endpoint is dead-code-eliminated
  from the bundle. The middleware never ships either. A static export is
  plain, read-only prose.

The pieces live in `src/lib/EditContext.tsx`, `src/components/
EditableBlock.tsx`, `EditableField.tsx`, and `SourceEditor.tsx`, wired up
in `Article.tsx`.

What's editable in place: paragraphs, headings, lists, blockquotes, the
title/lede — and **figure captions**, because caption text written as the
directive's inner content renders as an ordinary paragraph whose source
offsets point into the markdown. The directive line itself
(`:::figure{id=…}` and its attributes) and figure component code are not
editable in the browser — change those in the `.md` source or the
component files as usual.

## Workflow When Building an Article With This Skill

This section is canonical — the `/moonshine:still` command and the Codex
`$still` skill are thin wrappers that point here. Follow the moonshine
process from `SKILL.md` — story discovery first, no skipping to code.
Once the outline is agreed:

1. **Bootstrap the project.**
   - Pick a kebab-case project name from the user's topic. Resolve the
     project root to `~/.agent/moonshine/<project-name>/`. If it already
     exists, ask the user whether to reuse, rename, or wipe before
     continuing.
   - Copy `template/` from the plugin into the project root, excluding
     build artifacts the in-repo dev harness may have left behind:
     `rsync -a --exclude node_modules --exclude .velite --exclude dist
     --exclude '*.tsbuildinfo' template/ <project-root>/`
   - Run `npm install` in the background — it takes about a minute and
     you can keep talking to the user while it goes.
   - Start the dev server in the background: `npm run dev`, or
     `npm run dev:lan` when the user browses from another device (binds
     `0.0.0.0`; mDNS hostnames like `http://<hostname>.local:5173` are
     allowed through Vite's host check). The server uses
     `strictPort: true` with default port 5173; set
     `MOONSHINE_PORT=<port>` in the environment to use another.
   - **Read the actual URL from Vite's stdout** — do not assume
     `localhost:5173`. Vite logs `➜  Local: http://...` once ready.
     If Vite failed (port collision under strictPort), surface the
     error and ask the user how to resolve it. Do NOT auto-open the
     URL — the user keeps the page open and refreshes manually.

2. **Open in browser.** The reader sees the example content. Don't
   delete it yet — it's the demonstration that everything works.

3. **Write the first section.** Edit `content/example.md` (or create
   `content/your-topic.md` and delete the example). Use directives to
   place figures the writer wants. The figures don't need to exist
   yet — `<Figure>` shows a clear "no figure registered" placeholder.

4. **Build the first figure.** Pick the most important figure from
   the outline. Add it under `src/figures/` and register it. Confirm
   it appears in the article when its id is referenced.

5. **Iterate per-figure.** Open in browser, ask the user what to
   change, edit the figure file, watch HMR. Don't move to the next
   figure until this one teaches.

6. **Series, if planned.** The template ships with both modes wired up;
   there is no config switch. Single article → work in
   `content/example.md` (or your renamed file) and delete the
   `content/series/` folder. Series → create `content/series/index.md`
   and one `.md` per article in `content/series/`, and delete
   `content/example.md`. The root URL renders a series index when more
   than one article exists, and a single article when only one does.

## What Not to Do

- **Don't put JSX in markdown.** If you reach for `<Component prop="x" />`,
  add a directive handler or extend the registry instead.
- **Don't use MDX.** It would let writers import components, breaking
  the pristine-markdown invariant.
- **Don't use Mermaid for interactive diagrams.** Use React Flow.
- **Don't hardcode colors in figure files.** Reference the CSS custom
  properties (`var(--accent)`, `var(--text-2)`) from `tokens.css`.
- **Don't mount heavy figures eagerly.** Wrap them in `<LazyIsland>`
  (the default `<Figure>` already does this).
- **Don't write KPI cards, status badges, or metric grids.** Same
  anti-slop rules as `SKILL.md`. This is still an article.

## Cross-References

- `SKILL.md` — story discovery, editorial principles, anti-slop checklist
- `ARTICLE.md` — the HTML scaffold and CSS foundation `still` inherits
- `VISUALS.md` — D3 patterns; applies inside figure components the same
  way it does in `shine`
