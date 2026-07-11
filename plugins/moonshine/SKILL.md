---
name: moonshine
description: Help users create interactive explanations of technical concepts, inspired by Distill.pub
user_invocable: true
---

# Moonshine: Interactive Technical Explanations

Moonshine helps create interactive, web-based explanations of technical concepts. Inspired by [Distill.pub](https://distill.pub)'s argument that research distillation is valuable creative work, it provides scaffolding to turn complex ideas into explorable, visual, interactive articles.

AI tools generate complexity faster than people can consume it. Moonshine is for bridging that gap: helping people digest and communicate technical concepts clearly.

**Reference files:**
- `STILL.md` the structured Vite + React project flavor: markdown directives, figure registry, in-place editing, publishing
- `ARTICLE.md` the shine substrate: single-file HTML scaffold, CSS foundation, layout patterns, series structure (shine's hand-built kind)
- `VISUALS.md` visualization patterns, interaction, rendering technology, iteration (both substrates; see its preamble for still differences)
- `FEEDBACK.md` the authorship-feedback protocol: comments from the rendered still article flow back to the agent

## Articles, Not Dashboards

This is the central principle. Everything else follows from it.

Moonshine makes explanatory articles where prose drives understanding and interactive figures serve the narrative. We are not making dashboards, data products, or slide decks. The difference matters because it shapes every decision:

- An article has an author's voice and a progression of ideas. A dashboard has widgets.
- An article's figures are embedded in an argument. A dashboard's charts stand alone.
- An article earns attention through clarity. A dashboard demands attention through density.

When in doubt about a design choice, ask: "Would this feel at home in a Distill.pub article, or in a Grafana dashboard?" If the answer is dashboard, reconsider.

We are also not making coding tutorials. Equations and their connection to behavior should be shown through interactive visualizations, not code listings. If pseudocode helps connect math to implementation, keep it minimal and pair it with the equation. Never show implementation code (framework boilerplate, shader code, API calls) unless the article is specifically about programming.

## Two Substrates: shine and still

Moonshine renders articles on one of two substrates. Decide early, during story discovery, and confirm the choice at the Phase 1 checkpoint:

- **shine** — a single self-contained HTML file (vanilla JS + D3 from CDN). Choose when drafting fast, when the user wants one file they can email or host anywhere, or when the article is one-shot.
- **still** — a Vite + React + Velite project where prose lives in pristine markdown and figures are React components. Choose when the article will keep being edited after first publication, when figures need React state or component libraries (React Flow, react-three-fiber), when people will edit the prose without touching figure code, or when the work is a series or could become one.

If the user invoked a specific skill (`/moonshine:shine` or `/moonshine:still`), the choice is made. If they invoked moonshine generically, default to still — nearly every real article keeps being edited after first publication, and still is where the authoring affordances live (in-place editing, the knob panel, authorship feedback). Offer shine when the user wants one file they can email or host anywhere with no build step. Everything still-specific lives in `STILL.md`; the authorship-feedback loop (`FEEDBACK.md`) is still-only.

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

**Checkpoint:** Before delivering, verify the article:

1. Run the Editing Pass (see Editorial Tone) over the prose, section by section.
2. Walk the Anti-Slop list below item by item against the actual output, as a literal checklist pass, not from memory. Fix what you find.
3. If a browser or screenshot tool is available, screenshot each figure and check it against the Pedagogy principles: something interesting is visible before any interaction, defaults make the phenomenon dramatically visible, nothing is blank or waiting for a click.

### Output

Create projects in `~/.agent/moonshine/project-name/`. On the **shine** substrate each explanation is a self-contained HTML file; see `ARTICLE.md` for the scaffold template, layout patterns, and series structure. On the **still** substrate the project is a Vite + React app; see `STILL.md` for the bootstrap procedure and project structure.

After building, open the result in the browser (shine) or report the dev server URL to the user (still).

## Editorial Tone

Moonshine articles should have clear and humble prose. We are helping people digest, not force-feeding them. The writing should feel like a knowledgeable colleague explaining something at a whiteboard, not a keynote presentation.

The one-line rule: **remove the performance, keep the explanation.** Authorial performance is anything that draws attention to the writing instead of the thing being explained — the dramatic reveal, the quotable maxim, the teaser heading, the clever construction. The patterns below were extracted from a human author's line edits of drafted moonshine prose; each shows the move with a real before/after.

**Flatten the two-sentence reveal.** A punchy short sentence that "lands" a point reads as written, not spoken. Merge it into the prior sentence unless the punch is doing real work.
- Drafted: "The problem is not styling. It is that the page has no idea what it is showing."
- Edited: "The problem is not just a matter of styling, the page has no way of knowing what is important."

**Cut the maxim.** Delete any sentence that restates the point as a quotable principle or design slogan ("That is the property a good design should lean on: build for the shape, let the specifics be data." / "That is one word per field, not new machinery."). State the concrete fact and trust the reader to extract the lesson; don't hand them the moral.

**Headings describe or ask; they never tease.** Two reliable shapes: a gerund naming the activity, or the reader's literal question.
- "Every review has the same shape" → "Making review structure explicit"
- "What the author writes" → "Annotating the actions"
- "Marking fields: quick view versus detail" → "What should we show in quick view?"

**Ground in the real artifact.** Link or point to the concrete thing — the page, the file, the running demo — and start there. Cut abstract scene-setting that delays arrival; start at the point, not one sentence before it. "The reviews page shows all the reviews with minimal context and a quick approve button, how do we determine what to show in that list?" beats two sentences of conceptual framing about what the system can and cannot infer.

**Hedge the absolutes.** Final-sounding claims become partial and forward-looking: "not just a matter of styling" over "not styling"; "percent is a reasonable starting point" over "the cheapest way"; "in the future we can explore min/max hints" over closing the question.

**Plain subjects, plain verbs.** Make "we" (or the system) the subject instead of a nominalized abstraction. "We can't group into context, proposal, and evidence via inference alone" beats "The grouping into context, proposal, and evidence is the other thing inference cannot do."

**Asides must earn their length.** A vivid illustrative example survives only if it teaches faster than the literal mechanism stated plainly ("extending the format hint in the schema by introducing percent" needed no inventory of temperatures and row counts).

And the standing rules:

- Avoid em dashes. Use commas, periods, or restructure the sentence.
- Don't oversell. Say "this can help" not "this is a game-changer." Say "an appropriate metaphor" not "a precise metaphor."
- State what things do, not how important they are. Let the reader decide the importance.
- Prefer short, direct sentences, but never use the sentence break itself for drama (see the reveal pattern above).
- Use "tries to", "can", "helps" instead of absolute claims.

The target register is deliberately relaxed — conversational comma-joins, "Let's", "Currently" are on-voice. Relaxed is not unproofed: this register invites comma splices that don't scan and dropped words ("what it is important"), so proofreading is its own pass.

### The Editing Pass

After drafting prose, and again before delivering, walk each section against this checklist. It is the patterns above in executable order:

1. Find every punchy short sentence that "lands" a point. Merge it into the prior sentence unless the punch is doing real work.
2. Delete takeaway/maxim sentences. State the fact; cut the moral.
3. Rewrite headings to describe ("Annotating the actions") or ask ("What should we show in quick view?"). No teasers.
4. Link or point to the real thing. Replace abstract framing with the concrete artifact the reader can see.
5. Hedge the absolutes.
6. Make "we" or the system the subject with a plain verb; kill nominalized "The X is the thing that…".
7. Question each vivid aside: does it earn its length, or does the plain statement already carry it?
8. Cut the lead-in. Start at the point, not one sentence before it.
9. Proofread last — the relaxed register invites comma splices and dropped words.

### Sentence-Level Discipline

These rules come from Gopen's reader-expectation theory, adapted for explanatory articles. Readers receive meaning from structure, not from the writer's intention.

**Topic position.** The beginning of a sentence tells the reader whose story is being told. Keep the continuing subject in topic position across a paragraph. If every sentence starts with a different actor, the reader can't track the thread.

**Stress position.** The end of a sentence carries emphasis. Put the new concept, the causal turn, or the surprising detail near the end. Don't waste the stress position on filler ("basically", "in a sense", "overall").

**Old to new.** Begin sentences with material the reader already knows. Add new information after the familiar anchor. This lets the reader absorb each step without backtracking.

**Subject-verb proximity.** Don't let the grammatical subject and verb drift apart. Long sentences are fine. Buried verbs are not.

**Action in verbs.** "The creation of alignment occurred through implementation of a review process" hides the action in nouns. "The review process aligned the teams" puts it where it belongs.

### Banned Sentence Shapes

Ban the machinery, not just the vocabulary. These structural patterns signal AI prose regardless of word choice.

**Negation pivot:** "It is not X. It is Y." / "This is not about X; it is about Y." Only use this shape to correct a real false premise the reader holds. Otherwise, state the mechanism directly.

**False elevation:** "More than just X..." / "This is more than a tool..." / "Beyond being X..." If something is important, show what it does. Don't announce that it transcends its category.

**Dramatic reveal punctuation:** "The real issue: Y." / "The result? Z." / "One thing is clear: Y." Use punctuation for syntax, not as a drumroll.

**Triadic adjective stacks:** "clear, concise, and compelling" / "robust, scalable, and intuitive." If three adjectives can be swapped with three others and the sentence still works, the sentence says nothing.

**Aphoristic mirror sentences:** "X is the artifact; Y is the product." / "X is the surface; Y is the substrate." Symmetry is not insight. These sound smart because they are balanced, not because they are true.

**Grand openers:** "In today's fast-paced world..." / "In an ever-evolving landscape..." / "In the realm of..." Start inside the subject.

**Meta signposting:** "In this article, we'll explore..." / "Let's dive in." / "Here are the key takeaways." The reader is already reading. Don't narrate the experience of reading.

### Slop Repair

When a sentence smells like AI prose, don't just swap words. Rebuild the claim using this diagnostic scaffold:

> Under [condition], [actor] does [behavior] because [mechanism]. The pattern breaks when [boundary].

This scaffold is a repair tool, not always final prose. But it forces you to find the actor, mechanism, and boundary that the slop sentence was hiding.

Bad: "The visualization unlocks deeper understanding."
Repair direction: What does the reader do with the visualization? What changes in their mental model? When does the visualization fail to help?

### Dead Compliance

Prose can obey every rule above and still fail. Watch for:

- Sentences that are correct but lifeless
- Paragraphs that are clear but unsurprising
- Examples that prove claims too neatly
- Prose that feels like a well-edited memo wearing insight clothes
- Rhythm so disciplined that no thought seems to discover anything

Repair by adding pressure, not ornament: a stranger but accurate concrete detail, a real countercase, a boundary where the model breaks, or a sentence that admits uncertainty without surrendering the claim.

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
- Teaser headings that withhold the topic to manufacture curiosity (covered in Editorial Tone: describe or ask).
- Maxim sentences that package the point as a quotable principle (covered in Editorial Tone: cut the maxim).

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
