# Moonshine Still — Article Template

A Vite + React project for a moonshine article where prose lives in
pristine markdown (`content/*.md`) and figures are first-class React
components (`src/figures/`).

For the full architecture and design rationale, see
[`../STILL.md`](../STILL.md). This README is just the survival guide.

## Run

```bash
npm install        # first time; respects exact pins in package.json
npm run dev        # vite + velite in watch mode
```

Open <http://localhost:5173>. Vite and Velite both run in watch mode.

For reproducible installs across machines and CI, use:

```bash
npm ci             # installs from package-lock.json exactly, no resolution
```

## Supply-chain hygiene

This template ships with strict version pinning to limit exposure to
compromised package updates:

- All top-level deps in `package.json` are exact versions (no `^`, no `~`).
- `.npmrc` sets `save-exact=true` so future `npm install <pkg>` writes
  exact pins, and `engine-strict=true` to refuse mismatched Node.
- **Commit `package-lock.json`** to git — it pins transitive deps by
  content hash and is what `npm ci` reads from.
- Run `npm audit` periodically; upgrade deliberately by changing
  versions in `package.json` and running `npm install` + retesting.

## What's where

```
content/                  ← writers edit only here
  example.md
  series/
    index.md
    01-...md
    02-...md

src/
  components/
    Article.tsx           ← renders one article
    SeriesIndex.tsx       ← renders cards for the index
    Figure.tsx            ← block figure (:::figure{id=...}:::)
    Term.tsx              ← inline term (:term[word]{to=id})
    InlineViz.tsx         ← inline visual (:inline-viz{kind=...})
    LazyIsland.tsx        ← visibility-gated hydration wrapper
  figures/
    registry.ts           ← id → component map
    Sparkline.tsx         ← D3 example
    GradientField.tsx     ← plain SVG example
    LossLandscape.tsx     ← interactive React-state example
    FlowDiagram.tsx       ← React Flow example
    inline/
      MiniSpark.tsx       ← inline visual example
  lib/directive-handler.ts
  store.ts                ← Zustand: hover + pinned state
  styles/                 ← tokens.css + article.css

velite.config.ts          ← frontmatter schema; emits typed JSON
vite.config.ts
index.html
```

## Markdown grammar

Three directives, plus standard CommonMark.

```md
:::figure{id=loss-landscape}
Optional caption as markdown.
:::

The :term[gradient]{to=gradient-field} points uphill.

Too small :inline-viz{kind=mini-spark value=0.15} and you stall.
```

Three directive shapes (all single-colon for inline, triple-colon for
block):

- `:::figure{id=name}` ... `:::` — block figure (own paragraph)
- `:term[word]{to=id}` — inline labeled directive (clickable term)
- `:inline-viz{kind=foo attr=bar}` — inline unlabeled directive (mid-text visual)

Terms hover-highlight the linked figure on pointerenter/focus, and
pin-highlight + scroll into view on click.

## Add a figure

1. Create `src/figures/MyFigure.tsx` with a default-exported React
   component.
2. Add an entry to `src/figures/registry.ts`:
   ```ts
   import MyFigure from './MyFigure'
   export const figures = {
     // ...
     'my-figure': MyFigure,
   }
   ```
3. Reference it in markdown: `:::figure{id=my-figure}:::`.

For inline figures, register under `inlineFigures` and reference with
`:inline-viz{kind=my-figure ...attrs}`.

## Single article vs series

The template ships with both modes wired. Root URL behavior:

- **More than one article** → renders `SeriesIndex`, a cards list.
- **Exactly one article** → renders that article directly.

To switch to single-article mode, delete `content/series/`. To switch
to series-only mode, delete `content/example.md`.

## Notes

- Don't use MDX or write JSX in markdown — that would defeat the
  pristine-prose contract. Use directives instead.
- Don't use Mermaid. Use React Flow for interactive diagrams (the
  `FlowDiagram.tsx` example shows the pattern).
- Wrap heavy figures in `<LazyIsland>` (`<Figure>` already does this).
- Reference CSS custom properties in figure code (`var(--accent)`,
  `var(--text-2)`), not hardcoded hex.
