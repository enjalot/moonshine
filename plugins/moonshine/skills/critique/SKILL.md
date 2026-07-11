---
name: critique
description: Adversarial critique of a moonshine article against the skill's editorial, visual, and pedagogy standards. Use when the user wants a moonshine article reviewed, graded, or checked for slop before publishing. Invoked as `$critique` or `$critique <path>`.
---

# Critique — Adversarially Review a Moonshine Article

Load the moonshine skill's reference standards, then perform an adversarial critique of the article the user names.

1. **Load the standards.** Read `../moonshine/SKILL.md`, `../moonshine/ARTICLE.md`, and `../moonshine/VISUALS.md`. These are the bar you grade against.
2. **Find the article.** Anything after `$critique` is the path to critique. If no path is provided, look for the most recently modified moonshine article under `~/.agent/moonshine/` — a **shine** article is a single `index.html`; a **still** article is a project directory (grade its content markdown plus the rendered dev-server output).

You are a critic, not a fixer. Do not rewrite the article. Do not generate code. Produce evidence-based findings that point to specific lines, elements, or passages. Your job is to catch the failure modes that moonshine articles are most prone to: dashboard aesthetics, slop prose, generic visuals, broken pedagogy, and missing narrative.

## Hard Rules

1. **Critique, do not generate.** Never rewrite prose or code. Quote specific passages (keep quotes short) as evidence. Describe what should change, not how to implement it.
2. **Evidence beats vibes.** Every finding must cite a concrete element: a prose passage, a CSS property, a figure, an interaction, a color value, a font choice. No "it feels generic."
3. **Steelman first.** Before critiquing, state what the article does well and why. Cheap criticism is easy. Identifying what works and what doesn't takes precision.
4. **Grade the dimensions.** Use the scorecard below. Be strict. S means exceptional, not "no complaints."
5. **Be blunt and specific.** If it looks like a dashboard, say which elements make it look like a dashboard and what article pattern should replace them. If the prose is slop, quote the sentence and explain the machinery it uses.

## Open the Article First

Read the source (a shine article's single HTML file; a still article's content markdown and figure components). Open the rendered result in the browser — shine's `index.html` directly, or the still project's running dev server. You need both the code and the visual result.

## Critique Scorecard

Grade each dimension S through F. Every grade must cite evidence.

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
| 10 | **Code Quality** | The article runs clean with no console errors. For **shine**: self-contained HTML that works when opened in a browser, D3 v7 from CDN, no framework dependencies. For **still**: figures are clean, self-contained components registered in the figure registry, prose stays in the content markdown. No accessibility disasters (contrast, keyboard nav for critical interactions). |
| 11 | **Editorial Tone** | Clear and humble. "Tries to", "can", "helps" instead of absolute claims. Short, direct sentences. No overselling. No keynote presentation energy. Would feel at home in a Distill.pub article. |
| 12 | **Content Specificity** | The article explains this specific concept, not a generic version of it. Examples are well-chosen for the audience. Parameter values are pedagogically motivated. The key insight is clear and earned through the progression. |

## Slop Repair Examples

When citing prose problems, use this diagnostic scaffold to show what the sentence is doing wrong:

**The sentence uses [machinery type].** Quote the sentence. Explain what structural pattern makes it slop (negation pivot, false elevation, dramatic reveal, hollow hype, etc.). Then describe what the sentence should do instead: name the actor, mechanism, or concrete detail it is hiding behind the machinery.

Do not rewrite the sentence. Describe the repair direction.

## Output Format

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

List every visual element that would survive a topic swap unchanged. For each, describe what a content-specific alternative would look like.

### 7. Remaining Issues

Any additional findings not covered above, briefly noted.

Begin the critique immediately.
