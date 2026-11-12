---
name: diagram
description: Design and build a system, relationship, or process diagram for a moonshine still article so it reads right the first time, matching the diagrams the article already has. Use when the user asks for a diagram, an architecture or flow figure, "nice icons", or to make one figure look like the diagrams in another article. Invoked as `$diagram` or `$diagram <what to draw>`.
---

# Diagram: Draw a System So It Reads the First Time

A diagram in a moonshine article shows how named things relate: what talks to what, what contains what, what happens in what order, what changes between today and a proposal. This skill covers the decisions an author kept having to correct by hand across several real articles. It separates three layers, because they vary differently from article to article:

- **Information design** (what the diagram is for, what gets a node, what a line means). These lessons recurred in every article studied. Treat them as defaults and say so when you depart from one.
- **Visual style** (tiles, lines, colour, type). One look was reused across several articles, and others were accepted too. Match what the article has. With nothing to match, start from the board look described below and expect the author to steer it.
- **Technical implementation** (which component draws it). The built-in diagram draws both labelled boxes and icon tiles, and the author can rearrange and restyle it in the browser, so it is the default. A custom figure is for what it cannot do.

Read `../moonshine/STILL.md` ("Diagrams", "How a Figure Gets Added") and `../moonshine/VISUALS.md` ("Phones and touch") first. This skill adds to them.

## 1. Look at what the article already has

Before designing anything, find the article's existing diagrams and any sibling article the user names ("like the one in X").

- Open `src/figures/` and `content/figures/`. Note which diagrams are `DiagramSpec`s and which are custom figures on a shared kit (a folder such as `board/`, `kit/`, `prims/`, or a glyph file several figures import). If the article has a kit, **build on it without changing it**: add a glyph or a link family in its own grammar when the subject needs one.
- When the user points at another article, what is being borrowed is the grammar: how a thing is drawn, how a link is drawn and named, how a boundary is drawn. The subject's nouns are new each time. Copy that article's glyphs (register them with `registerGlyphs`) and its choices of tone, label side and link family; copy its kit folder only if the new diagram needs something the built-in diagram cannot draw.
- Render the existing figures and look at them. Note the surface (floor or plain), where labels sit, how links are named, what dashed means, what colour means. Your diagram uses the same answers.
- If the article has no diagrams and no sibling to follow, start from the tile look in section 4.

A reader learns each mark once. A second way of drawing the same kind of thing in the same article costs them that.

## 2. Decide what the diagram says

Write one sentence the diagram has to make true for a reader who only looks at it. "An order is saved before it is queued, and the slow work happens at the print partner." If you need "and also" for a different kind of relation, you have two diagrams.

**One kind of relation per diagram.** Runtime traffic and deployment are different questions about the same boxes, and so are "who can reach it" and "what it contains". Drawn together, the lines of one obscure the other. Draw two diagrams, and keep everything they share (zones, the tiles that appear in both) in the same position in both, so the reader's eye can carry one onto the other. The same holds for a legend that mixes two vocabularies: a figure for the things, then a figure for the marks and links.

**A figure does not repeat the one above it.** If the previous figure shows today's state, the next shows the proposal alone. Side-by-side "today and proposed" earns its place when the two are compared mark for mark, as rows of one figure sharing a scale, or as a two-state toggle.

**When one drawing has too much going on, sequence it.** A dense diagram with several paths through it reads better as a stepper: the full list of steps stays visible in a column on the left, each with a short name, and the drawing shows one at a time. If the paragraphs after a figure ask the reader to run logic in their head, those paragraphs are more steps.

**What gets a node.** A node is a thing that persists.
- A diagram of nodes alone is a good diagram when its job is to introduce a vocabulary: the pieces, each with its icon and name, before any figure connects them. Lay them out as a set (a row or a grid), so they do not read as a sequence.
- In a diagram that does have links, look twice at a node none of them touch. Either a relation that would connect it belongs in this diagram and is missing, or the node is here for another reason (context, a member of a zone) and should look like it.
- An event, a schedule, or an action is a line, named with a verb or a short phrase on the line ("nightly export"), with no box of its own.
- Two things that are deployed, owned, or changed separately are two nodes, even when they are usually said in one breath.
- Many of the same thing treated the same way are one node with a count badge.
- Keep to about 3 to 12 nodes. Past that, split or sequence.

**Position and direction carry meaning, so use them on purpose.**
- For anything that flows, fix which sides mean what: outputs leave on the right or the bottom, inputs arrive on the left or the top, on every tile. Then a reader can tell an input from an output by the side it is on.
- Things in a row read as a sequence. Lay independent items out so they look independent (a list, a grid, separate groups).
- A boundary (an account, a team, a machine, a trust line) is a zone the tiles sit inside. Something that only exists on the boundary's edge is a line crossing it.
- A process with a few steps is short and wide: one row, left to right. Before and after are two rows with step one aligned.

**Names.** Use the real name of each thing, or an invented plausible one. Placeholder letters ("A", "Service 1") read strangely next to prose that uses names.

## 3. Choose how to build it

| The diagram needs | Build it as | Why |
|---|---|---|
| Nodes and links, as labelled boxes or as icon tiles, with zones, link colours, direction, badges, a dashed "not yet" state | `DiagramSpec` on `DiagramFigure` (STILL.md "Diagrams") | The author owns the arrangement in `content/figures/<id>.json`, and can move, relabel, re-icon and recolour everything in the browser. It has a phone arrangement and a readability floor built in. Never edit that JSON's arrangement yourself. |
| Something that changes as the reader acts: a stepper that lights one path at a time, pieces the reader links or drags, a before/after toggle | A custom figure (`src/figures/drag/README.md`), drawn in the same grammar | The built-in diagram shows one state. Reuse its glyphs (`Glyph` from `diagram/glyphs`) and its colour tokens so the two kinds of figure look like one family. |
| A short linear process, possibly before and after | Either. A `DiagramSpec` of tiles in a row is the quick way; a custom row gives exact control of two aligned rows. | |

State which you chose and why when you report. Mermaid is never the answer (STILL.md).

You declare the spec; the author arranges it. Do not try to control positions from the spec, and do not write the arrangement file. Give the automatic layout a good start instead: list nodes in reading order, set `direction`, and group what belongs together.

## 4. The tile look, as a starting point

A node with an `icon` is drawn as a tile: a rounded square holding a glyph, with the label outside it. The label belongs to the node and moves with it.

```tsx
const SPEC: DiagramSpec = {
  direction: 'RIGHT',
  groups: [{ id: 'shop', label: 'Shop account' }, { id: 'partner', label: 'Print partner' }],
  nodes: [
    { id: 'customer', label: 'Customer', icon: 'person' },
    { id: 'storefront', label: 'Storefront', icon: 'service', tone: 'flow', group: 'shop' },
    { id: 'orders', label: 'Orders', icon: 'database', tone: 'data', group: 'shop' },
    { id: 'jobs', label: 'Print jobs', icon: 'queue', tone: 'data', group: 'shop' },
    { id: 'renderer', label: 'Renderer', icon: 'service', tone: 'flow', group: 'partner', badge: '4' },
    { id: 'proof', label: 'Proof check', icon: 'function', group: 'partner', dashed: true },
  ],
  edges: [
    { from: 'customer', to: 'storefront', label: 'orders', family: 'flow' },
    { from: 'storefront', to: 'orders', label: 'reads, writes', family: 'data', arrows: 'both' },
    { from: 'storefront', to: 'jobs', family: 'flow' },
    { from: 'jobs', to: 'renderer', label: 'one at a time', family: 'flow' },
    { from: 'renderer', to: 'proof', label: 'checks', dashed: true },
  ],
}
```

Fields: `icon`, `labelSide` (`above`, `below`, `left`, `right`; by default below, or to the right in a `DOWN` diagram), `tone` (the glyph's colour family), `badge` (a short mark such as a count), `dashed` on a node; `family` (colour) and `arrows` (`end` by default, `both`, `start`, `none`) on an edge; `style` (`box`, `corners`, `tint`, `dashed`) and `tone` on a group. An `icon` is a built-in glyph (`person`, `service`, `database`, `store`, `queue`, `document`, `function`, `key`, `browser`, `cloud`, `folder`, `gear`, `clock`, `bolt`), any Tabler icon as `tabler:<name>`, or any other text drawn as written, which is how an emoji is used. The template's `content/diagrams.md` shows each of these; read `src/figures/DiagramGallery.tsx` for specs to copy. The colour families are `flow`, `data`, `control`, `access`, defined as tokens (`--dg-flow` and so on) with dark values.

What the look consists of, and the reason for each part. When you match an existing article, these are the things to compare.

- **A tile holds a glyph, and the label sits outside it.** Text boxes were the most repeated correction: the author asked for icons in place of them in three separate articles. A label outside the tile can also be as long as it needs without overflowing a box.
- **A glyph stands for a kind of thing.** Every service is the same cube; every database the same cylinder. Two instances differ by their label. One glyph per tile. A second fact about a piece is a small mark on the tile (a count badge, a dashed outline), never a second icon.
- **Glyphs share one grammar**: a 24 unit box, a 1.5 stroke in the tone over a pale wash of it, round joins. When the product has its own icons for these things, redraw those in this grammar and add them with `registerGlyphs({ name: <g>…</g> })` from a figure file. Otherwise look for the kind in the Tabler set before reaching for a generic shape, and keep emoji for articles whose tone suits them, since they render differently on every platform and ignore the colour families. A handful of kinds is enough.
- **Links run square, with rounded corners, and end in a clear arrowhead.** The router gives each link its own port and keeps it off tiles and their labels. Direction is part of the meaning: one-way is the default, `arrows: 'both'` is a two-way relation, `arrows: 'none'` is an association with no direction.
- **A link is named by a label on the link**, a short verb or phrase, and the label carries the direction too: a small mark pointing the way the link runs, or one at each end for a two-way link. A reader who looks only at the label still knows who acts on whom. A label never hides its own link: on a run too short to show past it, the label sits beside the line. If a label is longer than every run of its link, shorten the label or expect the author to move the nodes apart. A link whose meaning is obvious from its ends takes no label.
- **Colour means family, and there are few families.** A link's hue says what it carries (traffic, data, control, access). A glyph's tone says what kind of thing it is. One accent is reserved for focus. Say what the colours mean in the caption.
- **Dashed means "not there yet" or "nothing passes".** Pick one meaning per article and say it in the caption. Solid means it exists.
- **The surface is plain.** Diagrams sit on the figure background with no floor, texture or theme. A grey floor behind the tiles was sent back on a legend and never asked for elsewhere. Lines that animate at rest were sent back as noise; motion is for a change the reader caused.

Named alternatives, and when each fits:

- **Labelled boxes** (no `icon`) when the nodes are sentences: decisions, options, quoted requirements, a step that is a formula. The seven box kinds in STILL.md are for these.
- **A mix**: tiles for the things, a box of `kind: 'note'` or an annotation for the one remark the diagram needs.
- **A warmer or more playful finish** when the figure is itself a game or a toy. That is a custom figure. Raise it by small steps and show the author one frame before restyling everything. A full theme change was tried once and sent back in favour of a cleaner look that kept the original glyphs.

## 5. Text around the diagram

- **The caption says what the figure shows and how to read it.** It goes inside the `:::figure` block after the `###` title. A paragraph under a figure that describes the figure is a caption in the wrong place; the prose after a figure moves the argument on. Keep the two close: a paragraph that explains a mark belongs directly under the figure that has the mark.
- **Introduce the vocabulary once.** In an article with several diagrams, an early figure shows each glyph with its name, and a second shows the marks and link families if there are many. The key uses the same components as the diagrams, so it cannot drift from them.
- **Use the glyphs inline.** Register a small component that renders `<Glyph name="database" tone="data" />` (from `diagram/glyphs`) as an `:inline-viz`, and put the mark beside the word where the prose first names each thing. Once one paragraph had them, the author asked for them throughout.
- **Every mark is explained or removed.** If a reader could ask what a dot or an outline means, the caption answers or the mark goes.
- **Detail goes in a tooltip or the caption**, and stays out of the drawing. Tile labels are one or two short lines. A tooltip follows the pointer and clears when it leaves; it also opens on tap and focus.
- **A numbered list under the board** is a good way to tie a diagram to a set of items (requests, steps, risks): each row lights the pieces and links it concerns and dims the rest, on hover, focus, and tap. Use `:term[...]{to=figure.part}` for the same link from the prose.

## 6. Size and phones

The built-in diagram draws at reading size (tile labels 14px, link labels 13px) and has a second arrangement for narrow screens, automatic until the author saves one from the editor's "Narrow (phones)" tab. Keep to the node count in section 2 and both stay readable.

A custom figure has to do this itself. A diagram drawn into a fixed `viewBox` and scaled to the column renders its labels at 5 to 6px on a phone. That failure was present in diagrams accepted on a desktop screen, where nobody had looked at a phone. Give it a narrow layout (the same tiles restacked top to bottom) switched on the measured width, with sideways scroll inside the figure as the fallback. See "Phones and touch" in VISUALS.md.

Leave room. A cramped first version was a correction more than once. A labelled link needs a run longer than its label between the two tiles, and a zone needs space for its own label clear of the tiles and their labels. You do not place the nodes, so say in your report which links are labelled and may need the author to open them up.

## 7. Look before you show it

Render the figure and read the screenshot at about 1100px and 360px, light and dark. Judge the picture, since the code will look fine. Check, in this order:

1. Does the one sentence from section 2 come through without the caption?
2. Any box that is really an action, any two things merged into one tile, any unlinked node that is there by accident?
3. Do all outputs leave on the agreed sides?
4. Any link running along another, under a tile, or through a label? Any link label on a corner or a crossing, or covering its whole link? Does every arrowhead and label mark point the way the relation goes?
5. Any text outside its container, overlapping, or under 13px?
6. Does a click or tap on a tile, link, or tag do what a click on its row or region does? Decorative layers should pass pointer events through.
7. Is there a mark the caption does not explain?
8. Does it still use only the article's existing vocabulary?

Fix what you find, then show the author. Say what you checked by screenshot and what you did not.

## 8. When the author corrects it

A correction to one diagram is usually a rule for all of them. When a comment names a pattern ("icons by type", "this should be a caption", "use the style from the other figure"), apply it to every figure in the article in the same pass and say that you did. If the author asks for a restyle across many figures, redraw one, show it, then do the rest with the same glyphs, tones and families so they stay consistent. Keep facts fixed while changing form, and list anything that changed form (a count that became a badge, a bare line that gained a tag).
