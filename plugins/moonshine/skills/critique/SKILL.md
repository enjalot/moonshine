---
name: critique
description: Adversarial critique of a moonshine article (still or shine) against the skill's editorial, visual, and pedagogy standards. Use when the user wants a moonshine article reviewed, graded, or checked for slop before publishing. Invoked as `$critique` or `$critique <path>`.
---

# Critique — Adversarially Review a Moonshine Article

Load the moonshine skill's reference standards, then perform an adversarial critique of the article the user names. Most moonshine articles are **still** projects (Vite + React + Velite); a **shine** article is a single self-contained HTML file. Figure out which one you're grading before you start — the standards you load and the checks you run depend on it.

## Setup

1. **Identify the substrate.**
   - **still** — a project directory: `package.json` + `content/*.md` prose + `src/figures/registry.ts`. This is the common case.
   - **shine** — a single `index.html` with inline JS and D3 from a CDN.

2. **Load the standards for that substrate.** These are the bar you grade against; don't grade a substrate against rules you haven't read.
   - Always: `../moonshine/SKILL.md` (editorial process, anti-slop, editing pass) and `../moonshine/VISUALS.md` (visualization patterns; its "In a still project" preamble covers the substrate differences).
   - **still** also: `../moonshine/STILL.md` (project structure, the three directives, figure registry, DEFAULTS/knobs, diagrams, series, publishing). Read `../moonshine/FEEDBACK.md` too if the article carries a `.feedback/` directory or the authorship loop is in scope.
   - **shine** also: `../moonshine/ARTICLE.md` (single-file HTML scaffold, CSS foundation, layout, series). Do **not** grade a shine article against `STILL.md`, or a still project against `ARTICLE.md`'s scaffold — they describe different substrates.

3. **Find the article.** Anything after `$critique` is the path to critique. If no path is given, look under `~/.agent/moonshine/` for the most recently modified article — a still project (a directory with `package.json`) or a shine `index.html`. When it's ambiguous, ask which one.

You are a critic, not a fixer. Do not rewrite the article. Do not generate code. Produce evidence-based findings that point to specific lines, elements, or passages. Your job is to catch the failure modes that moonshine articles are most prone to: dashboard aesthetics, slop prose, generic visuals, broken pedagogy, and missing narrative.

## Hard Rules

1. **Critique, do not generate.** Never rewrite prose or code. Quote specific passages (keep quotes short) as evidence. Describe what should change, not how to implement it.
2. **Evidence beats vibes.** Every finding must cite a concrete element: a prose passage, a CSS property, a figure, an interaction, a color value, a font choice. No "it feels generic."
3. **Steelman first.** Before critiquing, state what the article does well and why. Cheap criticism is easy. Identifying what works and what doesn't takes precision.
4. **Grade the dimensions.** Use the scorecard below. Be strict. S means exceptional, not "no complaints."
5. **Be blunt and specific.** If it looks like a dashboard, say which elements make it look like a dashboard and what article pattern should replace them. If the prose is slop, quote the sentence and explain the machinery it uses.

## Read Both the Source and the Rendered Result

You need the code and the visual output.

- **still** — read the prose in `content/**/*.md`, the figure components in `src/figures/`, the `src/figures/registry.ts` entries, and the palette/type stack in `src/styles/tokens.css`. Then view the rendered article: use the running dev server if there is one (read the real URL from Vite's stdout, don't assume `localhost:5173`), or `npm run build` and open `dist/`. Grade the built (reader-facing) view, not the dev editing chrome.
- **shine** — read the single `index.html`, then open it in the browser.

## Critique Scorecard

Grade each dimension S through F. Every grade must cite evidence. The dimensions apply to both substrates; the substrate-specific checks below feed dimensions 1, 4, 8, 9, and 10.

| # | Dimension | What to check |
|---|-----------|---------------|
| 1 | **Article, Not Dashboard** | No KPI cards, metric grids, status badges, card-heavy layouts, colored callout boxes. Information flows as prose within a narrative, not as isolated visual widgets. |
| 2 | **Prose Quality** | No em dashes. No false elevation ("more than just"). No negation pivots ("not X; it is Y") unless correcting a real premise. No grand openers. No triadic adjective stacks. No hollow hype verbs. No meta signposting ("in this article we will explore"). No aphoristic mirror sentences. No summary endings. Sentences have actors, mechanisms, and concrete details. |
| 3 | **Dead Compliance** | Prose can be clean and still dead. Check for: sentences that are correct but lifeless, paragraphs that are clear but unsurprising, examples that prove claims too neatly, rhythm so disciplined that no thought seems to discover anything. The writing should feel like a person explaining at a whiteboard, not a well-edited memo. |
| 4 | **Anti-Slop Visuals** | No default blue+purple palette. No Inter/Roboto/system-ui as the only font. No glowing box-shadows or pulsing animations. No emoji as section headers. No giant hero sections with gradient backgrounds. Visual choices should relate to the specific content being explained. If you swapped the topic and kept the design, would anything need to change? If not, the design is too generic. |
| 5 | **Typography & Layout** | Body text 18-20px, line height 1.5-1.6, line length 60-75 chars. Clear heading hierarchy. Moonshine type stack (Source Serif 4, Source Sans 3, Source Code Pro) or intentional alternatives. Whitespace and typography create structure, not card borders and shadows. |
| 6 | **Information Hierarchy** | Three levels distinguishable: primary (key insight), secondary (context, definitions), tertiary (technical details, edge cases). Visual weight makes the hierarchy obvious without reading a word. |
| 7 | **Narrative Progression** | The article has a progression of ideas, not a collection of sections. Each section builds on the previous one. The reader arrives at the key insight through a sequence, not a dump. Prose drives understanding; figures serve the narrative. |
| 8 | **Figure Pedagogy** | Exaggerated defaults that make phenomena dramatically visible. Sensible defaults (something interesting before the reader touches anything). Slow enough animations to follow cause and effect. Consistent visual conventions across figures. Looping animations reset cleanly. |
| 9 | **Interaction Design** | Interactions teach, not just demonstrate. The right pattern for the job (details-on-demand, explorable explanation, linked views, scroll-driven, animated transition). No blank canvases or "click to start" states. |
| 10 | **Code Quality** | Runs clean, no console errors, no accessibility disasters (contrast, keyboard nav for critical interactions). Substrate-specific structure — see the checks below. |
| 11 | **Editorial Tone** | Clear and humble. "Tries to", "can", "helps" instead of absolute claims. Short, direct sentences. No overselling. No keynote presentation energy. Would feel at home in a Distill.pub article. |
| 12 | **Content Specificity** | The article explains this specific concept, not a generic version of it. Examples are well-chosen for the audience. Parameter values are pedagogically motivated. The key insight is clear and earned through the progression. |

## Substrate-Specific Checks

Run the block for the substrate you identified. These are concrete, gradeable checks; fold each finding into the scorecard dimension it belongs to (noted in brackets).

### still

- **Pristine markdown [10].** `content/**/*.md` contains only CommonMark, math (`$…$` / `$$…$$`), and the three directives. No JSX, no `import`, no raw `<Component>` in prose. A `<tag>` in markdown is a defect — it should be a figure component or a directive.
- **Directives earn their place [9].** `:::figure{id=…}` block figures, `:term[word]{to=figure-id}` / `{to=figure-id.part}` links, and `:inline-viz{kind=…}` inline visuals. Every `to=` targets a real registry id (and a real part id after the dot). A `:term` link should teach — clicking it should reveal something in the figure the prose is talking about, not just outline a box. Flag term links that point at nothing or that never pay off.
- **Registry is honest [10].** Every id referenced in markdown is registered in `src/figures/registry.ts`. `height` is set so there's no layout shift before lazy mount and term-pin scroll lands right. `wide` is used intentionally, not by default. Heavy figures (3D, large canvas) are wrapped in `<LazyIsland>`.
- **Tunables are DEFAULTS, not magic numbers [8].** Values that shape what the reader sees are exported as a `DEFAULTS` const (registered for the knob panel), with `PARAM_HINTS` where a slider range matters. Constants shared across figures live in `src/figures/lib/`. Flag pedagogically load-bearing numbers buried in render logic.
- **Palette from tokens [4].** Figure components reference `var(--accent)`, `var(--text-2)`, etc. from `src/styles/tokens.css`. Hardcoded hex/rgb colors in a figure file are a defect — they break dark mode and the shared visual language.
- **Diagrams the right way [9/10].** Node-link diagrams are built on the template's `DiagramFigure` (React Flow), never Mermaid, and the author's `content/figures/*.json` layout is treated as untouchable author surface. Whole-figure vs part-level highlighting reads the store via `useFigureHighlight`.
- **Series integrity [7/10].** If it's a series, Velite frontmatter validates (`title`, `order`, `series`), the index cards and prev/next derive from the typed `articles[]`, and reading order tells a coherent progression. A single article has no stray `content/series/` folder.
- **The build is reader-clean [10].** `npm run build` passes (typecheck + Velite validation + Vite). The static export is inert — no editing chrome, knobs, or feedback UI in the bundle. Grade the built page, not the dev affordances.

### shine

- **Self-contained [10].** One `index.html` that works when opened directly from disk. D3 v7 from CDN. No framework dependencies, no build step, no external asset that breaks offline (beyond the CDN scripts and optional `data/`).
- **Layout and type from the scaffold [5].** Follows `ARTICLE.md`'s CSS foundation and layout patterns rather than a bespoke dashboard grid.
- **Interaction without a framework [9].** Vanilla JS interaction that still teaches; no blank "click to start" canvases.

## Slop Repair Examples

When citing prose problems, use this diagnostic scaffold to show what the sentence is doing wrong:

**The sentence uses [machinery type].** Quote the sentence. Explain what structural pattern makes it slop (negation pivot, false elevation, dramatic reveal, hollow hype, etc.). Then describe what the sentence should do instead: name the actor, mechanism, or concrete detail it is hiding behind the machinery.

Do not rewrite the sentence. Describe the repair direction.

## Output Format

State the substrate you graded in one line at the top, then:

### 1. Steelman

One paragraph: what this article does well and why it works. Cite specific elements.

### 2. Verdict

One line: PUBLISH / REVISE / RETHINK

- **PUBLISH**: Minor issues only. The article teaches its concept effectively.
- **REVISE**: Structural or prose issues that can be fixed without rethinking the approach.
- **RETHINK**: The article has fundamental problems with its progression, concept, or design approach.

### 3. Scorecard

The 12-dimension table with grades and evidence.

### 4. Top Findings

The 3-5 most important issues, ordered by impact. For each:

- **What**: the specific problem, with evidence (quoted prose, CSS values, element descriptions)
- **Why it matters**: what principle it violates and what effect it has on the reader
- **Repair direction**: what should change (not how to implement it)

### 5. Prose Audit

Quote every sentence that uses slop machinery. For each, name the machinery and the repair direction. If there are more than 10, list the 10 worst and note the count.

### 6. Anti-Slop Visual Audit

List every visual element that would survive a topic swap unchanged. For each, describe what a content-specific alternative would look like. For a still project, include the substrate checks that failed (hardcoded colors, unregistered ids, JSX in markdown, Mermaid diagrams).

### 7. Remaining Issues

Any additional findings not covered above, briefly noted.

Begin the critique immediately.
