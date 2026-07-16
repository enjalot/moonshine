# A Map of What Children Learn

The complete Moonshine still source for
[the published article](https://enjalot.github.io/moonshine/os-taxonomy-map/).
It maps 1,590 topics from Marble's open curriculum taxonomy by semantic
similarity, then uses scrollytelling, an age player, and a prerequisite
explorer to read the resulting geography.

The prose stays in `content/os-taxonomy-map.md`; the article-specific Canvas
figures live in `src/figures/AgeMap.tsx`, `Explorer.tsx`, and
`lib/taxonomy.ts`. The surrounding Vite + React + Velite project is a full
still scaffold, including the dev-only in-page editing and feedback loop.
See the repository's `plugins/moonshine/STILL.md` for the architecture.

The bundled data has its own license and attribution; see
[`DATA_LICENSE.md`](DATA_LICENSE.md).

## Run

```bash
npm install        # first time; respects exact pins in package.json
npm run dev        # vite + velite in watch mode
```

Open <http://localhost:5173>. Two watchers run: Velite re-emits typed
content on any `content/**/*.md` change, Vite hot-swaps anything under
`src/`.

- `npm run dev:lan` binds `0.0.0.0` for browsing from another device
  (`http://<hostname>.local:5173` passes Vite's host check). This
  exposes the dev-only write endpoints to your LAN — trusted networks
  only.
- The port is strict (no silent fallback). Run a second project with
  `MOONSHINE_PORT=5180 npm run dev`.
- `npm ci` for reproducible installs from `package-lock.json`.

## Editing in the page (dev only)

During `npm run dev` the rendered article is an editing surface:

- **Hold Cmd/Ctrl** to reveal block boundaries; **Cmd/Ctrl+click a
  block** (paragraph, heading, list, caption, title/lede) to edit its
  raw markdown in place. **Cmd/Ctrl+Enter** or **Done** saves; **Esc**
  cancels. After a body save, a transient **Undo** toast can restore
  the previous text.
- **Cmd/Ctrl+click a figure** to open the knob panel: sliders,
  checkboxes, and text inputs generated from the figure's registered
  `DEFAULTS`. Changes apply live; **Save to markdown** writes the
  values into the directive's attributes (only the ones that differ
  from the defaults). Figures without registered defaults explain how
  to opt in.
- **Cmd/Ctrl+drag a block** to reorder; a drop line shows the target.
  The open editor and the knob panel also carry **↑ / ↓** buttons.
- **💬 Comment to the agent** from the editor or knob panel sends
  feedback about that exact passage into `.feedback/`; the authoring
  agent picks it up and replies in the HUD (bottom corner), which also
  shows whether a listener is running.
- Every successful save **auto-commits** (message prefix
  `moonshine-edit:`) when the project is its own git repo, so you and
  the agent share one history. Older wording lives in `git log`.

Concurrent edits are safe: stale writes are rejected instead of
overwriting, and an open editor re-anchors (or parks your draft in a
recovery banner) when the file changes underneath it.

To turn the feedback subsystem off: set `feedback.enabled: false` in
`moonshine.config.json`, or `MOONSHINE_FEEDBACK=off` in the
environment.

None of this ships: a production `vite build` contains no edit UI and
no write endpoints.

## What's where

```
content/                  ← writers edit only here
  os-taxonomy-map.md
  figures/                ← author-saved diagram layouts (*.json)
  series/
    index.md
    01-...md

src/
  components/             ← article rendering + the dev-only edit chrome
    Article.tsx, SeriesIndex.tsx, Figure.tsx, Term.tsx, InlineViz.tsx,
    LazyIsland.tsx, FigureKnobs.tsx, EditableBlock.tsx, EditableField.tsx,
    SourceEditor.tsx, EditChrome.tsx, BlockReorderLayer.tsx,
    AuthorshipHUD.tsx, CommentBox.tsx, MoonshineFooter.tsx
  figures/
    registry.ts           ← id → {component, height, wide, defaults, paramHints}
    Sparkline.tsx         ← D3 example (registered knobs)
    GradientField.tsx     ← plain SVG example
    LossLandscape.tsx     ← interactive React-state example (PARAM_HINTS)
    DiagramFigure.tsx     ← generic React Flow diagram + arrange/save
    FlowDiagram.tsx       ← example diagram semantics on DiagramFigure
    lib/params.ts         ← attr→number/bool/string coercers
    inline/MiniSpark.tsx  ← inline visual example
  lib/                    ← EditContext, blocks, feedback client, directives
  store.ts                ← Zustand: hover + pinned state
  styles/                 ← tokens.css (palette + type) + article.css

velite.config.ts          ← frontmatter schema; emits typed JSON
vite-plugin-moonshine-edit.ts      ← dev-only save endpoint + auto-commit
vite-plugin-moonshine-feedback.ts  ← dev-only feedback endpoints
moonshine.config.json     ← feedback kill switch
```

## Markdown grammar

Three directives, plus standard CommonMark and math (`$\eta$` inline,
`$$...$$` display — KaTeX, bundled from npm).

```md
:::figure{id=loss-landscape lr=0.12}
### Optional figure title (a leading heading)
Optional caption as markdown. Attributes become props.
:::

The :term[gradient]{to=gradient-field.well} points uphill.

Too small :inline-viz{kind=mini-spark value=0.15} and you stall.
```

- `:::figure{id=name attr=value}` ... `:::` — block figure; every
  attribute passes to the component as a string prop. A leading heading
  in the inner content renders as the figure's title above the figure;
  the rest is the caption below. Both edit in place like any block.
- `:term[word]{to=id}` — clickable term; hover soft-highlights the
  linked figure, click pins it and scrolls it into view. Dotted refs
  (`to=figure-id.part`) target a specific element inside the figure.
- `:inline-viz{kind=foo attr=bar}` — mid-text visual.

## Add a figure

1. Create `src/figures/MyFigure.tsx` with a default-exported component
   typed `(props: FigureProps)`. Export a `DEFAULTS` const for its
   tunable values and parse props against it with `lib/params.ts`.
2. Register it in `src/figures/registry.ts`:
   ```ts
   import MyFigure, { DEFAULTS as myFigureDefaults } from './MyFigure'
   export const figures = {
     // ...
     'my-figure': { component: MyFigure, height: 320, defaults: myFigureDefaults },
   }
   ```
   `height` reserves space before lazy mount; `wide` breaks out of the
   article column; `defaults` powers the knob panel; add `paramHints`
   when a slider needs explicit bounds.
3. Reference it in markdown: `:::figure{id=my-figure}:::`.

Inline figures register under `inlineFigures` and render with
`:inline-viz{kind=my-figure ...attrs}`. For node-link diagrams, build
on `DiagramFigure` (see `FlowDiagram.tsx`) — never Mermaid.

## Single article vs series

This example contains one article, so the root URL renders it directly.
The still scaffold also supports a series: more than one markdown article
under `content/` switches the root to a cards index.

## Build and publish

```bash
npm run typecheck   # velite + tsc over src/ and the node-side configs
npm run build       # static site in dist/, no editing machinery
```

Deploying under a subpath? `npm run build -- --base=/that/path/` — the
router follows automatically. Patch the `<title>` in `dist/index.html`
(article titles are set at runtime). For deep links on GitHub Pages,
the custom 404 must sit at the site root; `index.html` already decodes
the `?/`-packed path a root `404.html` produces (the spa-github-pages
pattern — the moonshine repo's publish script writes that root file).

## Supply-chain hygiene

- All top-level deps are exact versions; `.npmrc` sets
  `save-exact=true` and `engine-strict=true` (Node ≥ 20).
- **Commit `package-lock.json`** — it pins transitive deps by hash and
  is what `npm ci` reads.
- Run `npm audit` periodically; upgrade deliberately and retest.

## Notes

- Don't use MDX or write JSX in markdown — use directives.
- Reference CSS custom properties in figure code (`var(--accent)`,
  `var(--text-2)`) from `tokens.css`, not hardcoded hex.
- Wrap heavy figures in `<LazyIsland>` (`<Figure>` already does this).
- `content/figures/*.json` is the author's arrangement surface — agents
  regenerate diagram *code*, never those files.
