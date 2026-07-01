---
name: shine
description: Create a self-contained interactive technical explanation (single HTML file with D3 v7, no build tools) inspired by Distill.pub. Use when the user wants to author, draft, or scaffold an explainer, interactive article, or visual essay about a technical concept. Invoked as `$shine` or `$shine <topic>`.
---

# Shine — Create an Interactive Explanation

Use this skill to start a new moonshine explanation. The user invokes it as `$shine` or `$shine <topic>` (anything after `$shine` is the starting topic; treat an empty topic as "start from scratch").

## Workflow

1. **Load the moonshine skill first.** Read `../moonshine/SKILL.md` and follow its full workflow — story discovery is mandatory and comes before any code.
2. **Reference files** live next to the moonshine skill:
   - `../moonshine/ARTICLE.md` — single-file HTML scaffold, CSS foundation, layout patterns, series structure.
   - `../moonshine/VISUALS.md` — D3 v7 visualization patterns, interaction, rendering decisions, iteration loop.
3. **Output location.** Write the project to `~/.agent/moonshine/<kebab-case-project-name>/` as a self-contained `index.html` plus an optional `data/` directory. Vanilla JS + D3 v7 only. No build tools, no frameworks.
4. **Story discovery is the gate.** Do not skip to code. Ask the user about concept, audience, key insight, and progression of understanding, then checkpoint with "Here's what I think we're building..." before scaffolding.
5. **Iterate.** Start with prose and static figures; add interaction only where it genuinely helps the reader.

## Notes

- This skill is the single shine entry point in every harness; Claude Code
  surfaces it as `/moonshine:shine`.
- For the structured **Vite + React + Velite** project flavor (multi-file
  content, markdown directives, React figures, in-place editing, authorship
  feedback), use `$still` instead. When the user hasn't picked a substrate,
  `SKILL.md` § "Two Substrates" makes still the default.
