---
title: "The Still: Moonshine's Harness"
description: "Authoring an interactive article by directly manipulating the content"
tags:
  - moonshine
  - authoring
  - interactive explanation
---

[Moonshine](https://github.com/enjalot/moonshine) is a skill for agents that helps turn a technical idea into an explorable article: combine prose and interactive figures inspired by [Distill](https://distill.pub). The first iteration of Moonshine focused on the `shine` command which writes a single self-contained HTML file, which can be generated quickly but is very hard to de-slop. This article introduces the `still` command which scaffolds a React project where the prose lives in plain markdown and each figure is a component and they are combined by a harness that adds some helpful editing features.

This page is a `still` article about `still`. Each of the figures below is a working simulation of one of the harness's authoring features. The purpose of these features is to make it easy to insert your taste directly into the output, rather than having to re-prompt detailed corrections.

## Markdown prose

Because the prose is plain text, you can :term[edit it in place]{to=prose-edit}. When you edit a block the change splices straight into the `.md` file on disk. We go into more detail on how saving works later. For now, try out the interaction yourself:

:::figure{id=prose-edit}
### Editing a paragraph where it renders
A paragraph you can edit. The edit is a splice into the source, so directive tokens like the term link survive untouched.
:::

The body of an article is CommonMark plus three small directives: a block `:::figure{id=…}` that places a registered figure, an inline `:term[word]{to=figure}` that links a phrase to a figure, and an inline `:inline-viz{kind=…}` for a small mid-sentence visual.

The editor works on offsets, not on rendered HTML. Each block carries the start and end position of its source, so committing an edit is `body.slice(0, start) + edited + body.slice(end)`. Rendered output isn't serialized back to markdown, which is why a `:term` or a figure inside the block remains unchanged when editing text.

## Tunable figures

Figures are implemented as React components by the agent, but often we want to play with the parameters to get the idea across. Rather than re-prompting the agent for every tweak, figures can export parameters which can be set by the author's markdown like: `:::figure{id=knobs frequency=4}`. The formula we are trying to communicate is:

$$
y(t) = A \sin(2\pi f t + \varphi)
$$

and the three parameters the figure exposes are $A$ (amplitude), $f$ (frequency), and $\varphi$ (phase), which can be changed via the markdown during writing or interactively by clicking on the figure:

:::figure{id=knobs frequency=4}
### A wave with three knobs
A figure with three parameters. Click it to open the simulated knobs, drag a slider, and watch the directive string update to match. The numbers live in the markdown, not hidden in the component. During dev, Cmd/Ctrl-click opens the real panel on this same figure.
:::

The :term[knob panel]{to=knobs} is derived automatically from the parameters. You get a slider paired with a number input for each number, a checkbox for each boolean and a text input for each string. Slider bounds come from each default's magnitude, and an integer default infers an integer step; when that heuristic guesses a range wrong, the figure can export explicit `PARAM_HINTS` bounds. Adjusting a value updates the figure live, and saving will write the new value to markdown.

This panel, like the other editing features, only renders during development, and the whole edit layer is dropped from a production build.

## Rearranging the page

Often we want to move blocks or figures around to reorganize an article. Still supports :term[dragging any block]{to=reorder} up or down. The open editor also carries up and down buttons for moving one step at a time. Reordering rewrites the markdown body.

:::figure{id=reorder}
Four blocks. The order you leave them in is the order written back to the file.
:::

A reorder is the same kind of save as a prose edit, which means it is covered by undo and by the conflict check that keeps the author and the agent from overwriting each other.

## Tangled words

Inspired by [Tangle](https://worrydream.com/Tangle/), prose can link to figures and drive interaction. A `:term[word]{to=figure-id}` turns a phrase into a sort of button. Hovering it highlights the linked figure while clicking pins the highlight and scrolls the figure into view. The dotted form `{to=figure-id.part}` targets one element inside a figure, so a phrase like :term[the gradient arrow]{to=terms.arrow} can light up the node or curve it describes, in this case a single arrow in the figure below.

:::figure{id=terms}
A sentence with linked terms beside a small diagram. Each link is just an id in the markdown.
:::

## Diagrams

With all due respect to Mermaid, it is difficult to prompt a good looking SVG diagram. Adjusting nodes and organizing links are still much easier to do manually, so the agent declares a diagram as a small spec (nodes, edges, and groups) rendered with [React Flow](https://reactflow.dev/), and the harness lets you arrange it. The arrangement is saved in a small JSON file next to the article:

:::figure{id=still-pipeline}
The still pipeline as a live React Flow diagram, not a simulation. The nodes and edges are declared in `StillPipelineDiagram.tsx`; the arrangement you see was saved to `content/figures/still-pipeline.json` from the editor described below.
:::

In development an arrange button appears under a diagram. It opens a full-screen editor where nodes snap to a grid and to each other's edges, you can resize them, pick which side an edge leaves from, add text and sticky notes, run an automatic layout on a selection, and crop the frame readers see. A second tab holds a narrow arrangement for phones. Readers get the live diagram with 15px labels that never shrink below 13px: on a narrow screen it switches to the narrow arrangement instead, and only scrolls sideways if that still doesn't fit. Because structure and arrangement are separate, the agent can regenerate the diagram's logic without disturbing where you placed everything:

:::figure{id=baked-diagram}
Structure from code, arrangement from JSON. The two halves are merged by node id every time the page renders.
:::

## Adding your own content

Sometimes the fastest fix is to add something yourself. In edit mode, hovering the gap between any two blocks shows a **+**, notebook style, that inserts a paragraph, a diagram, or an image at that spot. A diagram opens the same editor as above with two boxes to start from: add boxes, drag from a box's edge to another to connect them, and label everything. Images are uploaded next to the article. Everything lands in the markdown like any other edit, so you can 💬 on it and ask the agent to extend what you drew or turn it into a proper figure.

## How the author and the agent share the files

The point of all this is to let the author take over from the AI without a handoff. You prompt the coding agent in the terminal and you click and edit in the browser, and :term[both write to the same plain-text files]{to=dual-surface} under `content/`: markdown for prose, small JSON files for baked figure state.

The harness uses git as the shared memory. Each browser save is committed with a recognizable `moonshine-edit:` marker, so the agent can read exactly what you changed and treat it as authoritative, and you get real history to undo from.

:::figure{id=dual-surface}
The two surfaces writing to one source: the browser and the terminal both edit `content/`, and git records which one made each change.
:::

## Comments as targeted prompts

While directly editing is a great way to cut the slop, sometimes you still want to tell the agent what is wrong and let it do the work. In edit mode, every prose editor and knob panel carries a 💬 button. By writing a comment you create a small JSON file that carries the context for your feedback to the agent.

:::figure{id=feedback}
The life of one comment. Send one with 💬, then press Address in the simulated HUD: the request is queued, the comment moves through delivered and addressed, and the reply surfaces next to it.
:::

The skill sets up hooks when it creates the article which will check for the presence of an `address.json` file created when you click "address comments". This means comments accumulate by default allowing you to add notes and requests as you read and edit. When the agent has acted, it writes a one-line `reply` into the comment file, and the harness surfaces that reply next to your comment.

## Start stillin'

Invoke the `still` skill in your agent and describe what you want to explain. The skill interviews you first, then it scaffolds the project, starts the dev server, and you are in the loop: prompt for the hard structural work, click, drag and edit for the small adjustments.

The scaffold this page came from lives in the [moonshine repo](https://github.com/enjalot/moonshine), and there are more published examples at [enjalot.github.io/moonshine](https://enjalot.github.io/moonshine/). Point your favorite agent at the skill and start stillin!
