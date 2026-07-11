---
name: still
description: Scaffold an opinionated Vite + React + Velite project for a moonshine article — markdown prose with custom React figures, hot-reloading, single-article or series mode. Use when the user wants a structured multi-file interactive explanation rather than a single self-contained HTML file. Invoked as `$still` or `$still <topic>`.
---

# Still — Scaffold a Structured Moonshine Article Project

Use this skill to bootstrap a structured moonshine project. The user invokes it as `$still` or `$still <topic>`; Claude Code surfaces it as `/moonshine:still`. This is the single still entry point in every harness.

## Workflow

1. **Load context in order.**
   - Read `../moonshine/SKILL.md` for the editorial process and anti-slop rules.
   - Read `../moonshine/STILL.md` for the project structure, directive grammar, registry pattern, store, and React Flow guidance.
   - Reference `../moonshine/VISUALS.md` for visualization patterns inside figure components (its "In a still project" preamble covers the substrate differences).
   - The palette and type stack live in the template itself: `src/styles/tokens.css` is the source of truth. `../moonshine/ARTICLE.md` is the shine reference — don't take scaffold or series structure from it.
   - `../moonshine/FEEDBACK.md` when working with the authorship-feedback loop (comments from the rendered page).

2. **Story discovery first.** Follow the moonshine `SKILL.md` workflow — story discovery comes before code. Do not skip to scaffolding.

3. **Bootstrap and iterate** per `STILL.md` § "Workflow When Building an Article With This Skill" — that section is canonical for the project bootstrap (template copy with artifact excludes, background `npm install`, `moonshine.meta.json` with the article's title/intent/session id, dev server startup and URL reporting), the per-figure iteration loop, and series-vs-single-article guidance. The template lives at `../moonshine/template/`. Don't skip the meta file — it's what the moonshine directory (`directory/` in the plugin repo) uses to index the article and link it back to this conversation.

## Anti-slop

Editorial tone and anti-slop rules from `../moonshine/SKILL.md` still apply. This is an article, not a dashboard.
