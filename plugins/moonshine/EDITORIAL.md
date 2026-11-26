---
name: editorial
description: Editorial tone, the 9-step Editing Pass, sentence-level discipline, banned AI prose shapes, slop repair, and dead compliance rules for moonshine articles
---

# Editorial Tone & Prose Craft

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

A metaphor may name a chapter in a kicker line, never in the `h1` or `<title>`, and it must name the same thing in every chapter. A series whose parts are titled "The Lens", "The Projector" and "The Filter" tells a reader scanning the index nothing, and "projector" drifted between two different tools by part five.

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

## The Editing Pass

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

## Sentence-Level Discipline

These rules come from Gopen's reader-expectation theory, adapted for explanatory articles. Readers receive meaning from structure, not from the writer's intention.

**Topic position.** The beginning of a sentence tells the reader whose story is being told. Keep the continuing subject in topic position across a paragraph. If every sentence starts with a different actor, the reader can't track the thread.

**Stress position.** The end of a sentence carries emphasis. Put the new concept, the causal turn, or the surprising detail near the end. Don't waste the stress position on filler ("basically", "in a sense", "overall").

**Old to new.** Begin sentences with material the reader already knows. Add new information after the familiar anchor. This lets the reader absorb each step without backtracking.

**Subject-verb proximity.** Don't let the grammatical subject and verb drift apart. Long sentences are fine. Buried verbs are not.

**Action in verbs.** "The creation of alignment occurred through implementation of a review process" hides the action in nouns. "The review process aligned the teams" puts it where it belongs.

## Banned Sentence Shapes

Ban the machinery, not just the vocabulary. These structural patterns signal AI prose regardless of word choice.

**Negation pivot:** "It is not X. It is Y." / "This is not about X; it is about Y." Only use this shape to correct a real false premise the reader holds. Otherwise, state the mechanism directly.

**False elevation:** "More than just X..." / "This is more than a tool..." / "Beyond being X..." If something is important, show what it does. Don't announce that it transcends its category.

**Dramatic reveal punctuation:** "The real issue: Y." / "The result? Z." / "One thing is clear: Y." Use punctuation for syntax, not as a drumroll.

**Triadic adjective stacks:** "clear, concise, and compelling" / "robust, scalable, and intuitive." If three adjectives can be swapped with three others and the sentence still works, the sentence says nothing.

**Aphoristic mirror sentences:** "X is the artifact; Y is the product." / "X is the surface; Y is the substrate." Symmetry is not insight. These sound smart because they are balanced, not because they are true.

**Grand openers:** "In today's fast-paced world..." / "In an ever-evolving landscape..." / "In the realm of..." Start inside the subject.

**Meta signposting:** "In this article, we'll explore..." / "Let's dive in." / "Here are the key takeaways." The reader is already reading. Don't narrate the experience of reading.

## Slop Repair

When a sentence smells like AI prose, don't just swap words. Rebuild the claim using this diagnostic scaffold:

> Under [condition], [actor] does [behavior] because [mechanism]. The pattern breaks when [boundary].

This scaffold is a repair tool, not always final prose. But it forces you to find the actor, mechanism, and boundary that the slop sentence was hiding.

Bad: "The visualization unlocks deeper understanding."
Repair direction: What does the reader do with the visualization? What changes in their mental model? When does the visualization fail to help?

## Dead Compliance

Prose can obey every rule above and still fail. Watch for:

- Sentences that are correct but lifeless
- Paragraphs that are clear but unsurprising
- Examples that prove claims too neatly
- Prose that feels like a well-edited memo wearing insight clothes
- Rhythm so disciplined that no thought seems to discover anything

Repair by adding pressure, not ornament: a stranger but accurate concrete detail, a real countercase, a boundary where the model breaks, or a sentence that admits uncertainty without surrendering the claim.
