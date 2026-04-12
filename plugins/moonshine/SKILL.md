---
name: moonshine
description: Help users create interactive explanations of technical concepts, inspired by Distill.pub
user_invocable: true
---

# Moonshine: Interactive Technical Explanations

Moonshine helps create interactive, web-based explanations of technical concepts. Inspired by [Distill.pub](https://distill.pub)'s argument that research distillation is valuable creative work, it provides scaffolding to turn complex ideas into explorable, visual, interactive articles.

AI tools generate complexity faster than people can consume it. Moonshine is for bridging that gap: helping people digest and communicate technical concepts clearly.

**Reference files:**
- `ARTICLE.md` HTML scaffold, CSS foundation, layout patterns, series structure
- `VISUALS.md` D3 visualization patterns, interaction, rendering technology, iteration

## Articles, Not Dashboards

This is the central principle. Everything else follows from it.

Moonshine makes explanatory articles where prose drives understanding and interactive figures serve the narrative. We are not making dashboards, data products, or slide decks. The difference matters because it shapes every decision:

- An article has an author's voice and a progression of ideas. A dashboard has widgets.
- An article's figures are embedded in an argument. A dashboard's charts stand alone.
- An article earns attention through clarity. A dashboard demands attention through density.

When in doubt about a design choice, ask: "Would this feel at home in a Distill.pub article, or in a Grafana dashboard?" If the answer is dashboard, reconsider.

We are also not making coding tutorials. Equations and their connection to behavior should be shown through interactive visualizations, not code listings. If pseudocode helps connect math to implementation, keep it minimal and pair it with the equation. Never show implementation code (framework boilerplate, shader code, API calls) unless the article is specifically about programming.

## The Process

**Do not skip to code.** The most common failure mode is jumping straight to scaffolding without understanding what the user is trying to explain and who they're explaining it to. The second most common failure mode is asking a few questions upfront and then writing the entire article in one shot.

Moonshine is a conversation, not a generation pipeline. The process has natural checkpoints where you stop and check in with the user before continuing.

### Phase 1: Story Discovery

Before writing any code, have a conversation with the user. Ask questions and listen. You need to understand:

- **What concept are you explaining?** Get specific. Not "machine learning" but "how gradient descent finds minima."
- **Who is the audience?** What can they already be assumed to know? What's new to them?
- **What is the key insight?** What is the single thing the reader should walk away understanding?
- **What is the progression of understanding?** What does the reader need to learn first, second, third to arrive at the insight? Map the dependency chain of ideas.
- **What misconceptions exist?** What do people commonly get wrong, and how can interaction expose the correct mental model?

Ask these questions one or two at a time. Start with "What are you trying to explain?" and follow the thread. Wait for answers before moving on. If the user gives you all the context upfront, you can move faster, but if they give a brief prompt, slow down and ask.

**Checkpoint:** Before moving to Phase 2, confirm the concept, audience, insight, and progression with the user. "Here's what I think we're building..." This is the single most important moment in the process. Get it wrong and everything downstream is wasted effort.

### Phase 2: Article Structure

Now design the article at a high level. Present the user with a proposed structure:

- What sections will the article have?
- What is the role of each section in the progression? (introduces concept, builds intuition, shows application, etc.)
- Where will interactive figures go, and what will they show?
- What kind of interaction will each figure use? (slider, brush, scroll-driven, hover, etc.)
- Is this a single article or a series?

Write this as a short outline, not code. For each figure, describe it in prose: what it shows, what the reader can do with it, and what they should learn from it. This prose description is the spec. Something like:

```
1. Opening: what gradient descent is trying to do
   Prose + static diagram of a loss landscape as a 3D surface

2. The naive approach: why random search fails
   Interactive: click to place random guesses on the surface, watch them miss the minimum

3. Following the slope: the gradient points downhill
   Interactive: drag a point on the surface, an arrow shows the gradient direction and magnitude

4. Step size matters: too big overshoots, too small stalls
   Explorable: slider controls learning rate, animation shows convergence path on the surface

5. Putting it together: watch gradient descent solve a real problem
   Scroll-driven: each scroll step reveals the next iteration, building the path incrementally
```

**Checkpoint:** Share this outline with the user. Ask if the progression makes sense. Are there concepts missing? Is the order right? Should any section be interactive that isn't, or static that is? Do the prose descriptions of the figures capture what the user has in mind? This is cheap to change now and expensive to change after building.

### Phase 3: Build One Section

Pick the most important interactive section and build it first. Not the whole article. One section.

Open it in the browser. Show the user. Ask:
- Does this interaction teach what we intended?
- Is the data/example well chosen?
- Does the visual encoding make sense?

Iterate on this section until it works before building the rest.

### Phase 4: Complete the Article

Build the remaining sections, following the structure from Phase 2. After each major section, open in the browser to verify. Prose should be written alongside the figures, not after, because the prose frames what the reader should notice in each figure.

**Checkpoint:** Before delivering, review the complete article against the Anti-Slop checklist below.

### Output

Create projects in `~/.agent/moonshine/project-name/`. Each explanation is a self-contained HTML file. See `ARTICLE.md` for the scaffold template, layout patterns, and series structure.

After building, open the result in the browser.

## Editorial Tone

Moonshine articles should have clear and humble prose. We are helping people digest, not force-feeding them.

- Avoid em dashes. Use commas, periods, or restructure the sentence.
- Don't oversell. Say "this can help" not "this is a game-changer." Say "an appropriate metaphor" not "a precise metaphor."
- State what things do, not how important they are. Let the reader decide the importance.
- Prefer short, direct sentences. If a paragraph feels like it's building to a dramatic reveal, flatten it.
- Use "tries to", "can", "helps" instead of absolute claims.

The writing should feel like a knowledgeable colleague explaining something at a whiteboard, not a keynote presentation.

## Anti-Slop

AI coding tools have strong defaults that produce generic, recognizable output. Moonshine articles should not look like AI made them. They should look like a thoughtful person made them.

The test is simple: does this look like an article, or does it look like a dashboard? Every rule below is a specific case of that question.

**Dashboard patterns to avoid:**

- **Numbered KPI cards** (big number + label + colored border). These are for monitoring, not explaining. If you need to show a quantity, put it in a sentence or a figure caption.
- **Metric grids** (3-4 cards in a row showing counts/percentages). Same problem. An article introduces numbers in context, not in a grid of isolated stats.
- **Status badges** (green/yellow/red pills). These encode operational state. Articles explain concepts, not system health.
- **Card-heavy layouts** where every section is a rounded-corner box with a shadow. Articles use whitespace and typography for structure, not containers.
- **Colored callout boxes** (blue "insight" boxes, green "tip" boxes). Information should flow as prose within the narrative. Callouts break reading flow. If something is important enough to highlight, write it as a strong sentence in the text.

**Generic AI visual patterns to avoid:**

- Inter, Roboto, or system-ui as the only font. Use the moonshine type stack (Source Serif 4, Source Sans 3, Source Code Pro) or choose fonts with intention.
- Default blue (#3B82F6) + purple (#8B5CF6) accent palette. Choose colors that relate to the content.
- Glowing box-shadows, pulsing animations, or gradient borders. These are decorative, not informative.
- Emoji as section headers or bullet markers.
- "Hero" sections with giant centered text and a gradient background on every page.

**Prose patterns to avoid:**

- Em dashes everywhere (covered in Editorial Tone).
- Bold claims stated as universal truth ("This fundamentally changes...").
- Numbered lists where prose would flow better. Not everything is a "3-step process."
- Ending with a grand summary that restates everything just said.

**The check:** Before delivering, scan the output. If you swapped the content for a different topic and nothing else needed to change, the design is too generic. The visual choices should relate to what's being explained.

Adapted from the anti-slop patterns in [visual-explainer](https://github.com/nicobailon/visual-explainer) by nicobailon.

## Design Principles

These principles come from [Distill.pub](https://distill.pub) and the broader tradition of explanatory writing:

**Information hierarchy.** Three levels, always distinguishable. Primary: the key insight and its argument. Secondary: context, definitions, related concepts. Tertiary: technical details, proofs, edge cases (margin notes or expandable sections). Typography, spacing, and visual weight make this hierarchy clear without the reader having to read a word.

**Visual encoding.** Position and length are the most accurate channels; use them for the most important data. Color encodes categories or highlights, not quantitative information alone. Redundant encoding (color + position) improves accessibility. Consistent visual language across all figures.

**Typography.** Large readable body (18-20px), generous line height (1.5-1.6), constrained line length (60-75 chars), clear heading hierarchy. Monospace for code, KaTeX for math. Margin notes over footnotes.

**Interaction patterns.**

| Pattern | Use When |
|---------|----------|
| Details-on-demand | Supplementary info would clutter the narrative |
| Explorable explanation | The concept involves a parameter space to explore |
| Linked views | The same data has multiple meaningful representations |
| Scroll-driven narrative | The explanation has a natural sequence of reveals |
| Animated transition | The path between two states is meaningful |

## Pedagogy

These principles come from building real moonshine articles and noticing what gets corrected most often.

**Exaggerate for clarity.** Default parameter values should make phenomena dramatically visible. If you're showing viscosity, crank it up so the effect is obvious. If you're showing divergence between two methods, pick parameters where they clearly disagree. Pedagogical clarity trumps physical realism. The reader can always dial things down; they can't learn from effects too subtle to see.

**Sensible defaults.** Every interactive figure must show something interesting before the reader touches anything. No blank canvases, no "click a particle to start", no grids of dots waiting to settle. Pre-select a default element, pre-populate with data, start the simulation in a state that already demonstrates the concept.

**Slow enough to follow.** Animated demonstrations should move slowly enough that the reader can track cause and effect. When a particle moves through a field, the reader needs to see the field respond. When in doubt, go slower. The reader can always speed things up.

**Consistent conventions across figures.** If you show a radius as a dotted circle in one figure, show it the same way in every figure. If you color-code a variable blue in an equation, use that same blue everywhere it appears. Inconsistency forces the reader to re-learn the visual language in each figure.

**Looping animations reset cleanly.** If a demonstration loops, it should reset to its initial state, not carry over physics or accumulated values from the previous iteration.

## Reference Skills

- **grill-me** Approach to guided question-asking to help users clarify their thinking.
