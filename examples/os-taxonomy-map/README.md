# A Map of What Children Learn

The complete Moonshine still source for
[the published article](https://enjalot.github.io/moonshine/os-taxonomy-map/).
It maps the 1,590 topics of Marble's open curriculum taxonomy by the
meaning of their descriptions, then asks how much of the taxonomy's own
structure (subjects, starting ages, prerequisites) that map recovers.

The bundled data has its own license and attribution; see
[`DATA_LICENSE.md`](DATA_LICENSE.md). `public/taxonomy.json` is used as
shipped: every number in the prose can be recomputed from it, and the
figures derive what they show (age counts, ancestries) at load time.

## What's where

```
content/os-taxonomy-map.md     the prose; the only file a writer edits

src/figures/
  registry.ts                  figure id → component, height, defaults
  AgeMap.tsx                   Figure 2: topics opening at each age
  Explorer.tsx                 Figure 3: prerequisites drawn on the map
  lib/taxonomy.ts              data loading + canvas helpers shared by all three figures
  lib/params.ts                attribute → number/bool/string coercers
  taxonomy.css                 styles for the three figures
src/components/
  ScrollyTour.tsx, Step.tsx    Figure 1: the `::::scrolly-tour` / `:::step` container
                               (camera choreography in code, card text in markdown)

public/taxonomy.json           the dataset (third-party, ODbL)
```

Everything else (`src/components/`, `src/lib/`, `src/styles/`, the two Vite
plugins, and `DiagramFigure.tsx`, `AuthoredDiagram.tsx`, `builtin.ts`,
`diagram/`, `drag/` under `src/figures/`) is the still template, unchanged
apart from the two tour components registered in `Article.tsx` and the
figure rules appended to `styles/article.css`. See
`plugins/moonshine/STILL.md` in this repository for how the template
works, including the dev-only in-page editing and feedback loop.

## How the figures connect to the prose

- The tour's cards are `:::step` blocks in the markdown; the view each
  card shows is the matching entry of `STEPS` in `ScrollyTour.tsx`.
- `:term[age 6]{to=age-map.age-6}` previews that age in Figure 2 while
  hovered and moves the figure there when clicked. Any `age-4` … `age-13`
  works.
- `:term[Unit fractions]{to=explorer.unit-fractions}` previews that
  topic's prerequisite lines in Figure 3 while hovered and selects it when
  clicked. The part ids are listed in `TERM_TOPICS` in `Explorer.tsx`.
- Both figures export `DEFAULTS` (the age and the topic they open on), so
  `:::figure{id=age-map age=7}` or `:::figure{id=explorer topic="3-D shapes"}`
  changes the opening view from the markdown, and the dev knob panel
  (Cmd/Ctrl+click the figure) edits them.

## Run

```bash
npm install        # first time; respects exact pins in package.json
npm run dev        # vite + velite in watch mode, http://localhost:5173
npm run build      # typecheck + static site in dist/
```

Set `MOONSHINE_PORT=5180` to use another port (the port is strict).
`npm run dev:lan` binds `0.0.0.0`; it exposes the dev-only write endpoints
to your network, so use it on trusted networks only.

## Publish

From the repository root:

```bash
scripts/publish-example.sh examples/os-taxonomy-map os-taxonomy-map
```

This builds with the `/moonshine/os-taxonomy-map/` base and syncs the
result into `docs/os-taxonomy-map/`.
