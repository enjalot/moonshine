---
name: still
description: Scaffold an opinionated Vite + React + Velite project for a moonshine article — markdown prose with custom React figures, hot-reloading, single-article or series mode. Use when the user wants a structured multi-file interactive explanation rather than a single self-contained HTML file. Invoked as `$still` or `$still <topic>`.
---

# Still — Scaffold a Structured Moonshine Article Project

Use this skill to bootstrap a structured moonshine project. The user invokes it as `$still` or `$still <topic>`. This is the Codex equivalent of the Claude Code `/moonshine:still` command.

## Workflow

1. **Load context in order.**
   - Read `../moonshine/SKILL.md` for the editorial process and anti-slop rules.
   - Read `../moonshine/STILL.md` for the project structure, directive grammar, registry pattern, store, and React Flow guidance.
   - Reference `../moonshine/ARTICLE.md` for shared scaffold and palette context.
   - Reference `../moonshine/VISUALS.md` for D3 patterns inside figure components.

2. **Story discovery first.** Follow the moonshine `SKILL.md` workflow — story discovery comes before code. Do not skip to scaffolding.

3. **Project bootstrap (after the story converges).**
   - Pick a kebab-case project name from the user's topic. Resolve the project root to `~/.agent/moonshine/<project-name>/`. If it exists, ask the user whether to reuse, rename, or wipe before continuing.
   - Copy the entire `../moonshine/template/` directory into the project root (preserve structure: `content/`, `src/`, configs, `.gitignore`).
   - Run `npm install` in the background — it takes about a minute and you can keep talking to the user while it runs.
   - Once install completes, run `npm run dev` in the background (Velite watch + Vite concurrently). The Vite dev server uses `strictPort: true` with default port 5173.
   - **Read the actual URL from Vite's stdout** — do not assume `localhost:5173`. Tail the dev-server task output, extract the `➜  Local:` URL, and report it to the user. If Vite failed (port collision under strictPort), surface the error and ask the user how to resolve it. Do NOT auto-open the URL — the user keeps the page open and refreshes manually.

4. **Iteration loop.** Edit `content/*.md` for prose and `src/figures/*.tsx` for figures (both hot-reload independently). Add new figures by (a) creating the component file, (b) registering it in `src/figures/registry.ts`, (c) referencing it in markdown via `:::figure{id=...}`.

5. **Keep the shipped example content visible** while iterating so the user can see the directive grammar in action. Replace it section by section as the article takes shape.

## Series vs single article

The template ships with both modes wired. Single article → work in `content/example.md` and delete `content/series/`. Series → work in `content/series/` and delete `content/example.md`. The root URL renders a series index when more than one article exists, a single article when only one does. No config switch.

## Figure library guidance

Visualization libraries are open. Defaults:
- **D3 v7** for data-driven charts (`VISUALS.md` patterns transfer directly into React components).
- **React Flow** for node-link diagrams (preferred over Mermaid — see `STILL.md`).
- **Plain SVG** for static or simple interactive figures.
- **react-three-fiber** for 3D, wrapped in `<LazyIsland>`.

## Anti-slop

Editorial tone and anti-slop rules from `../moonshine/SKILL.md` still apply. This is an article, not a dashboard.
