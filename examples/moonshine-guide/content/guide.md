---
title: "The Still: Moonshine's Harness"
description: "Authoring an interactive article by directly manipulating the content"
tags:
  - moonshine
  - authoring
  - interactive explanation
---

[Moonshine](https://github.com/enjalot/moonshine) is a skill for agents that helps turn a technical idea into an explorable article, combining prose and interactive figures in the style of [Distill](https://distill.pub). The first iteration of Moonshine focused on the `shine` command, which writes a single self-contained HTML file. That is quick to generate but very hard to de-slop. This article introduces the `still` command, which scaffolds a React project where the prose lives in plain markdown, each figure is a component, and a harness combines them and adds some helpful editing features.

This page is a `still` article about `still`. The editing features only exist while the dev server is running, so most of the figures below are working simulations of them, one per feature. The purpose of these features is to make it easy to insert your taste directly into the output, rather than having to re-prompt detailed corrections.

## Markdown prose

Because the prose is plain text, you can :term[edit it in place]{to=prose-edit}. Hold Cmd/Ctrl and click a block, and it becomes a textarea holding that block's markdown. When you save, the change splices straight into the `.md` file on disk. Try it here, where a plain click stands in for Cmd/Ctrl+click:

:::figure{id=prose-edit}
### Editing a paragraph where it renders
Open the second paragraph and change a word next to the `:term[gradient]{to=field}` directive. After saving, the link renders as it did before, because the edit never rewrote the directive's source.
:::

The body of an article is CommonMark plus three small directives: a block `:::figure{id=…}` that places a registered figure, an inline `:term[word]{to=figure}` that links a phrase to a figure, and an inline `:inline-viz{kind=…}` for a small mid-sentence visual.

The editor works on offsets into the markdown source. Each block carries the start and end position of its source, so committing an edit is `body.slice(0, start) + edited + body.slice(end)`. We never serialize rendered output back to markdown, which is why a `:term` or a figure inside the block comes through an edit unchanged. After each save an Undo button appears for a few seconds. If the file changed on disk while your editor was open, say because the agent edited it first, the save is rejected and your text stays in the editor, so the newer version is not overwritten.

## Tunable figures

Figures are implemented as React components by the agent, but often we want to play with the parameters to get the idea across. Rather than re-prompting the agent for every tweak, a figure can export its parameters, and the author can set them in the markdown: `:::figure{id=knobs frequency=4}`. The formula we are trying to communicate is:

$$
y(t) = A \sin(2\pi f t + \varphi)
$$

and the three parameters the figure exposes are $A$ (amplitude), $f$ (frequency), and $\varphi$ (phase). They can be changed in the markdown while writing, or from a panel that opens when you Cmd/Ctrl+click the figure:

:::figure{id=knobs frequency=4}
### A wave with three knobs
The panel under the wave is a simulation of the real one. Move a slider and the line at the bottom shows what Save would write: only the values that differ from the figure's defaults, which is why `frequency=4` is there from the start and the amplitude is not. Closing the panel with × throws unsaved values away. During dev, Cmd/Ctrl+click opens the real panel on this same figure.
:::

The :term[knob panel]{to=knobs} is derived automatically from the parameters. You get a slider paired with a number input for each number, a checkbox for each boolean and a text input for each string. Slider bounds come from each default's magnitude, and an integer default infers an integer step; when that heuristic guesses a range wrong, the figure can export explicit `PARAM_HINTS` bounds. Adjusting a value updates the figure live, and saving writes the new value to markdown. The panel's header also has buttons to move the figure up or down, make it wide, delete it, and comment on it.

This panel, like the other editing features, only renders during development, and the whole edit layer is dropped from a production build.

## Rearranging the page

Often we want to move blocks or figures around to reorganize an article. Hold Cmd/Ctrl and :term[drag any block]{to=reorder} up or down: the block lifts off the page and the others slide apart to show where it will land. A block is one top-level piece of the markdown (a heading, a paragraph, a list, a whole figure with its caption), so dragging a heading moves the heading and leaves its paragraphs where they were. The open editor and the knob panel also carry up and down buttons for moving one step at a time. Reordering rewrites the markdown body.

:::figure{id=reorder}
Drag the figure block above the heading and watch the markdown: the three lines of the `:::figure` directive move together, caption included. The order you leave the blocks in is the order written back to the file.
:::

A reorder is the same kind of save as a prose edit, so it is covered by the same undo and by the same check that keeps the author and the agent from overwriting each other.

## Linking words to figures

Inspired by [Tangle](https://worrydream.com/Tangle/), prose can link to figures and drive interaction. A `:term[word]{to=figure-id}` turns a phrase into a sort of button. Hovering it highlights the linked figure, while clicking pins the highlight and scrolls the figure into view. The dotted form `{to=figure-id.part}` targets one element inside a figure, so a phrase like :term[the gradient arrow]{to=terms.arrow} can light up the node or curve it describes, in this case a single arrow in the figure below. Terms are for readers, so unlike the editing features they work on the published page.

:::figure{id=terms}
Hover each term in the sentence: its part of the drawing lights up, and so does the line of markdown that makes the link. Each link is just an id in the markdown.
:::

## Diagrams

With all due respect to Mermaid, it is difficult to prompt a good looking diagram. Adjusting nodes and organizing links is still much easier to do by hand, so the agent declares a diagram as a small spec (nodes, edges, and groups), the harness draws it as SVG, and you arrange it. The arrangement is saved in a small JSON file next to the article:

:::figure{id=still-pipeline}
This figure is the real feature and the others are simulations: a live diagram of the still pipeline. The nodes and edges are declared in `StillPipelineDiagram.tsx`; the positions were dragged by hand and saved to `content/figures/still-pipeline.json` from the editor described below.
:::

In development an **edit diagram** button appears under a diagram. It opens a full-screen editor where you work on the diagram itself. Boxes drag on a grid and line up with each other's edges. Double-clicking the canvas makes a new box, dragging from the dot on a box's side connects it to another box, and double-clicking any label lets you retype it. Drag an arrow's end and it re-routes to the nearest side of any box, drop a box inside a group and it joins the group, slide a label along its arrow. You can also add text and sticky notes, and a small toolbar above the selection holds the rest.

The frame readers see follows the content, and dragging its edges adds room. A second tab holds a narrow arrangement for phones, and a switch sets whether the figure sits in the text column or breaks out wide. Readers get the live diagram with 15px labels that never shrink below 13px: on a narrow screen it switches to the narrow arrangement, and only scrolls sideways if that still doesn't fit.

Because structure and arrangement are separate, the agent can regenerate the diagram's logic without disturbing where you placed everything:

:::figure{id=baked-diagram}
Arrange the boxes and save, then press **Agent rewrites the spec** twice. The first rewrite renames every box and nothing moves, because the two halves are merged by node id every time the page renders. The second adds a Rerank box that the JSON has no position for, so it is placed automatically and outlined until you arrange it and save again.
:::

Every drag in that editor, like the block reordering above, is built with [declarative dragging](https://declarative-dragging.github.io). Instead of handling pointer events, the code says which diagrams a drag can lead to (this arrow attached to any side of any box, this box inside or outside the group) and the library renders those possibilities to work out the motion, snapping and animation. The same toolkit ships in the template for figures that readers drag, so an agent can make a slider snap to the values the prose talks about, or let a reader grab the output of a computation and pull the inputs along with it. :term[The crest of the wave]{to=knobs.crest} above is one of those: where it sits is computed from the amplitude and the phase, and dragging it searches for the amplitude and phase that put it under the pointer.

## Adding your own content

Sometimes the fastest fix is to add something yourself. During development, hovering the gap between any two blocks shows a **+**, notebook style, that inserts a block of text, a diagram, or an image at that spot. A diagram opens the same editor as above with two boxes and an arrow to start from. Images are uploaded into the project's `public/media/` folder. Everything lands in the markdown like any other edit, so you can 💬 on it and ask the agent to extend what you drew or turn it into a proper figure.

## How the author and the agent share the files

The point of all this is to let the author take over from the AI without a handoff. You prompt the coding agent in the terminal and you click and edit in the browser, and :term[both write to the same plain-text files]{to=dual-surface} under `content/`: markdown for prose, small JSON files for diagram arrangements.

The harness uses git as the shared memory. The skill makes each project its own git repository, and each browser save is committed there with a recognizable `moonshine-edit:` prefix, so the agent can read exactly what you changed and treat it as authoritative, and you get real history to undo from.

:::figure{id=dual-surface}
Save a couple of edits as the author, then make one as the agent. The agent's pane shows it reading the log first and counting your `moonshine-edit:` commits since its own last one, and the log keeps the two kinds of commit apart.
:::

## Comments as targeted prompts

While directly editing is a great way to cut the slop, sometimes you still want to tell the agent what is wrong and let it do the work. During development, every prose editor and knob panel carries a 💬 button. Writing a comment creates a small JSON file that records which passage or figure you were pointing at.

:::figure{id=feedback}
The life of one comment. Send it with 💬, then press Address in the simulated HUD and follow the `status` line in the file: `pending` until you ask, `delivered` when the agent's session picks it up, `addressed` once the reply is written.
:::

Comments accumulate by default, so you can leave notes and requests as you read and edit. Nothing reaches the agent until you press **Address** in the HUD at the corner of the page, which writes an `address.json` file. The plugin installs a hook that runs each time the agent finishes a turn, and when it finds that file it hands your open comments to the session that wrote the article. When the agent has acted, it writes a one-line `reply` into the comment file, and the HUD shows that reply next to your comment.

## Start stillin'

Invoke the `still` skill in your agent and describe what you want to explain. The skill interviews you first, then it scaffolds the project and starts the dev server, and you are in the loop: prompt for the hard structural work, click, drag and edit for the small adjustments.

The scaffold this page came from lives in the [moonshine repo](https://github.com/enjalot/moonshine), and there are more published examples at [enjalot.github.io/moonshine](https://enjalot.github.io/moonshine/). Point your favorite agent at the skill and start stillin!
