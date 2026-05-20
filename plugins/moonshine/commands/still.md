---
description: Scaffold an opinionated Vite + React project for a moonshine article with pristine markdown prose and custom React figures
---
Load the moonshine skill, then the still reference (`STILL.md`), then help the user create a structured interactive explanation for: $@

Follow the moonshine `SKILL.md` workflow — story discovery first, no skipping to code. Use `ARTICLE.md` for shared scaffold and palette context, `VISUALS.md` for D3 patterns inside figure components, and `STILL.md` for the project structure, directive grammar, registry pattern, store, and React Flow guidance.

**Project bootstrap after story discovery converges**

1. Pick a kebab-case project name from the user's topic. Resolve the project root to `~/.agent/moonshine/<project-name>/`. If it already exists, ask the user whether to reuse, rename, or wipe before continuing.

2. Copy the entire `template/` directory from the moonshine plugin into the project root. Preserve directory structure including `content/`, `src/`, configs, `.gitignore`.

3. Run `npm install` in the project root. Run it in the background — the install takes a minute and you can keep talking to the user while it goes.

4. Once install completes, start `npm run dev` in the background. This runs Velite watch + Vite concurrently. The Vite dev server is configured with `strictPort: true` and a default port of 5173 — if that port is occupied, Vite will fail loudly rather than silently pick another one.

5. **Read the actual URL from Vite's stdout** — do not assume `localhost:5173`. Vite logs a line like `➜  Local:   http://localhost:5173/` once it's ready. Tail the dev-server task output, extract that URL, and report it to the user. If Vite failed (port collision under strictPort), surface the error and ask the user how to resolve it (kill the conflicting process, or change `server.port` in `vite.config.ts`). Do NOT use `open http://...` — the user keeps the page open and refreshes manually.

6. From this point onward, edit `content/*.md` for prose and `src/figures/*.tsx` for figures. Both hot-reload independently. Add new figures by (a) creating the component file, (b) registering it in `src/figures/registry.ts`, (c) referencing it in markdown via `:::figure{id=...}`.

7. Default to keeping the shipped example content visible while iterating, so the user can see the directive grammar in action. Replace it section by section as the user's article takes shape.

**Series vs single article**

The template ships with both modes wired up. If the user wants a single article, work in `content/example.md` and delete the `content/series/` folder. If a series, work in `content/series/` and delete `content/example.md`. The root URL renders a series index when more than one article exists, and a single article when only one does. No config switch.

**Figure library guidance**

Visualization libraries are open. Default to **D3 v7** for data-driven charts (the `VISUALS.md` patterns transfer directly into React components), **React Flow** for node-link diagrams (preferred over Mermaid — see `STILL.md`), **plain SVG** for static or simple interactive figures, and **react-three-fiber** for 3D wrapped in `<LazyIsland>`.

**Anti-slop and editorial tone** still apply — see `SKILL.md`. This is an article, not a dashboard.
