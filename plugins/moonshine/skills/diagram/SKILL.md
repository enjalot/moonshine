---
name: diagram
description: Design and build a system, relationship, or process diagram for a moonshine still article so it reads right the first time, matching the diagrams the article already has. Use when the user asks for a diagram, an architecture or flow figure, "nice icons", or to make one figure look like the diagrams in another article. Invoked as `$diagram` or `$diagram <what to draw>`.
---

# Diagram: Draw a System So It Reads the First Time

A diagram in a moonshine article shows how named things relate: what talks to what, what contains what, what happens in what order, what changes between today and a proposal. This skill covers the decisions an author kept having to correct by hand across several real articles. It separates three layers, because they vary differently from article to article:

- **Information design** (what the diagram is for, what gets a node, what a line means). These lessons recurred in every article studied. Treat them as defaults and say so when you depart from one.
- **Visual style** (tiles, lines, colour, type). One look was reused across several articles, and others were accepted too. Match what the article has. With nothing to match, start from the board look described below and expect the author to steer it.
- **Technical implementation** (which component draws it). There are three sound choices. Pick by what the diagram needs.

Read `../moonshine/STILL.md` ("Diagrams", "How a Figure Gets Added") and `../moonshine/VISUALS.md` ("Phones and touch") first. This skill adds to them.

## 1. Look at what the article already has

Before designing anything, find the article's existing diagrams and any sibling article the user names ("like the one in X").

- Open `src/figures/` and look for a shared kit: a folder such as `board/`, `kit/`, `prims/`, or a glyph file several figures import. If one exists, **build on it without changing it**. Add a glyph or a link family in the kit's own grammar when the subject needs one. Put anything one figure needs alone in that figure's file.
- When the user points at another article, copy that article's kit folder into this one and adapt the vocabulary (the glyph kinds, the link families). What is being borrowed is the grammar: how a thing is drawn, how a link is drawn and named, how a boundary is drawn. The subject's nouns are new each time.
- Render the existing figures and look at them. Note the surface (floor or plain), where labels sit, how links are named, what dashed means, what colour means. Your diagram uses the same answers.
- If the article has no diagrams and no sibling to follow, this skill's `kit/` is the starting point (section 4).

A reader learns each mark once. A second way of drawing the same kind of thing in the same article costs them that.

## 2. Decide what the diagram says

Write one sentence the diagram has to make true for a reader who only looks at it. "An order is saved before it is queued, and the slow work happens at the print partner." If you need "and also" for a different kind of relation, you have two diagrams.

**One kind of relation per diagram.** Runtime traffic and deployment are different questions about the same boxes, and so are "who can reach it" and "what it contains". Drawn together, the lines of one obscure the other. Draw two diagrams, and keep everything they share (zones, the tiles that appear in both) in the same position in both, so the reader's eye can carry one onto the other. The same holds for a legend that mixes two vocabularies: a figure for the things, then a figure for the marks and links.

**A figure does not repeat the one above it.** If the previous figure shows today's state, the next shows the proposal alone. Side-by-side "today and proposed" earns its place when the two are compared mark for mark, as rows of one figure sharing a scale, or as a two-state toggle.

**When one drawing has too much going on, sequence it.** A dense diagram with several paths through it reads better as a stepper: the full list of steps stays visible in a column on the left, each with a short name, and the drawing shows one at a time. If the paragraphs after a figure ask the reader to run logic in their head, those paragraphs are more steps.

**What gets a node.** A node is a thing that persists and that some line touches.
- A thing with no line to it is not in this diagram. Either the relation that would connect it belongs here and you draw it, or the node goes.
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
| Boxes with a text label, arrows, groups, and the author wants to drag things into place in the browser | `DiagramSpec` on `DiagramFigure` (STILL.md "Diagrams") | The author owns the arrangement in `content/figures/<id>.json`, it has a phone layout and a readability floor built in. Never edit that JSON's arrangement yourself. |
| A glyph per node with the label outside, links coloured by what they carry, zones, a per-piece state (proposed, missing, in focus), or a badge | A custom figure on a board kit (`kit/` here, or the article's own) | `DiagramSpec` nodes have a label and a kind only, and its edges have one colour. In the articles studied, every diagram the author was happy with needed at least one of these and was built this way. |
| A short linear process, possibly before and after | A custom figure with a row of glyph squares | A router and zones are more than a row needs. Use the kit's `Glyph` with plain arrows. |

State which you chose and why when you report. Put the reason in a comment at the top of the figure file, so the answer is already there when the author asks why a figure is custom. Mermaid is never the answer (STILL.md).

A board is hand-placed coordinates in code. That is workable because the kit keeps the placement small (a position per tile, two sides per link) and because you will look at the render and fix it before the author does. It does mean the author cannot drag it. If they want to arrange it themselves, offer the `DiagramFigure` version and say what it gives up.

## 4. The board look, as a starting point

`kit/board.tsx` and `kit/board.css` are a starter. Copy both into `src/figures/board/` and edit them in the article. They are a default to adapt: the glyph set, the link families, and the hues are the first things to change for the subject.

```tsx
import { Board, Zone, type Link, type Piece } from './board/board'

const PIECES: Piece[] = [
  { id: 'customer', kind: 'person', label: 'Customer', x: 44, y: 60, labelAbove: true },
  { id: 'storefront', kind: 'service', label: 'Storefront', x: 160, y: 200, labelAbove: true },
  { id: 'orders', kind: 'database', label: 'Orders', x: 310, y: 200, labelAbove: true },
  { id: 'jobs', kind: 'queue', label: 'Print jobs', x: 160, y: 330 },
  { id: 'renderer', kind: 'service', label: 'Renderer', x: 470, y: 330, badge: '4' },
]
const LINKS: Link[] = [
  { id: 'order', from: 'customer', to: 'storefront', out: 'b', in: 'l', text: 'orders', family: 'flow' },
  { id: 'save', from: 'storefront', to: 'orders', text: 'saves', family: 'data' },
  { id: 'enqueue', from: 'storefront', to: 'jobs', out: 'b', in: 't', family: 'flow' },
  { id: 'take', from: 'jobs', to: 'renderer', text: 'one at a time', family: 'flow' },
]

<Board w={650} h={420} label="A sentence that says what the diagram shows." pieces={PIECES} links={LINKS}>
  <Zone label="Shop account" x={96} y={120} w={280} h={280} />
  <Zone label="Print partner" x={396} y={120} w={240} h={280} tone={1} />
</Board>
```

What the look consists of, and the reason for each part. When you match an existing article, these are the things to compare.

- **A tile holds a glyph, and the label sits outside it.** Text boxes were the most repeated correction: the author asked for icons in place of them in three separate articles. A label outside the tile can also be as long as it needs without overflowing a box.
- **A glyph stands for a kind of thing.** Every service is the same cube; every database the same cylinder. Two instances differ by their label. One glyph per tile. A second fact about a piece is a small mark on the tile (a count badge, a dashed outline, a filled edge), never a second icon.
- **Glyphs share one grammar**: a 24 unit box, a 1.5 stroke in the family hue over a pale wash of that hue, round joins. When the product has its own icons for these things, use those. Draw a new glyph for the subject's nouns in the same grammar. A handful of kinds is enough.
- **Links run square, with rounded corners.** Each link has its own port on a tile's side, no link runs along another or under a tile, and where two cross, the upper one carries a halo in the surface colour so it reads as passing over. Dashed links start and end on a dash and keep their port dot and arrowhead, so they still look attached.
- **A link is named by a tag on the link**, a short verb in the mono font, sitting on the middle of the link's longest leg, clear of corners, crossings, and tiles. A leg must be longer than its tag. A link whose meaning is obvious from its ends takes no tag.
- **Colour means family, and there are few families.** A link's hue says what it carries (traffic, data, access). A glyph's hue says what kind of thing it is. Zones get a muted hue each. One accent is reserved for focus. Ink and surfaces come from the article's tokens so the dark scheme follows.
- **Dashed means "not there yet" or "nothing passes".** Pick one meaning per article and say it in the caption. Solid means it exists.
- **The surface is calm.** A pale flat floor behind a board with many links helps the halos and tiles read. A legend or a figure with few links sits better on the plain figure background (`floor={false}`). Texture, pictorial themes, and lines that animate at rest were each tried and sent back as noise. Motion is for a change the reader caused.

Named alternatives, and when each fits:

- **Plain arrows on the figure background** (a thin line and a small arrowhead, no casing, no floor) for a single row of steps, where there is nothing to cross.
- **A warmer or more playful finish** when the figure is itself a game or a toy. Raise it by small steps (tile depth, a draw-in when a link is made) and show the author one frame before restyling everything. A full theme change was tried once and sent back in favour of a cleaner look that kept the original glyphs.
- **Labelled boxes** when the nodes are sentences (decisions, options, quoted requirements). Then the built-in `DiagramFigure` is the better tool.

## 5. Text around the diagram

- **The caption says what the figure shows and how to read it.** It goes inside the `:::figure` block after the `###` title. A paragraph under a figure that describes the figure is a caption in the wrong place; the prose after a figure moves the argument on. Keep the two close: a paragraph that explains a mark belongs directly under the figure that has the mark.
- **Introduce the vocabulary once.** In an article with several diagrams, an early figure shows each glyph with its name, and a second shows the marks and link families if there are many. The key uses the same components as the diagrams, so it cannot drift from them.
- **Use the glyphs inline.** Wrap the kit's `Glyph` in a text-height `<svg>`, register it as an `:inline-viz`, and put the mark beside the word where the prose first names each thing. Once one paragraph had them, the author asked for them throughout.
- **Every mark is explained or removed.** If a reader could ask what a dot or an outline means, the caption answers or the mark goes.
- **Detail goes in a tooltip or the caption**, and stays out of the drawing. Tile labels are one or two short lines. A tooltip follows the pointer and clears when it leaves; it also opens on tap and focus.
- **A numbered list under the board** is a good way to tie a diagram to a set of items (requests, steps, risks): each row lights the pieces and links it concerns and dims the rest, on hover, focus, and tap. Use `:term[...]{to=figure.part}` for the same link from the prose.

## 6. Size and phones

The kit draws at natural size in real pixels (labels 14px, tags 13px) and scrolls sideways inside its own box when the column is narrower, so text holds the 13px floor and the page never scrolls sideways. Size the board to the column: measure the figure's inner width in the running article (about 650px in the column, about 715px with `wide`) and keep `w` at or under it.

A diagram drawn into a fixed `viewBox` and scaled to the column renders its labels at 5 to 6px on a phone. That failure was present in diagrams accepted on a desktop screen, where nobody had looked at a phone. If the diagram matters on a phone, give it a narrow layout (the same tiles restacked top to bottom) and switch on the measured width. Sideways scroll is the fallback.

Leave room. A cramped first version was a correction more than once. Tiles sit at least two tile widths apart where a tagged link runs between them, and a zone leaves space for its own label clear of the tiles and their labels.

## 7. Look before you show it

Render the figure and read the screenshot at about 1100px and 360px, light and dark. Judge the picture, since the code will look fine. Check, in this order:

1. Does the one sentence from section 2 come through without the caption?
2. Any tile with no link, any box that is really an action, any two things merged into one tile?
3. Do all outputs leave on the agreed sides?
4. Any link running along another, under a tile, or through a label? Any tag on a corner or a crossing, or wider than its leg? The kit warns in the console for the last one.
5. Any text outside its container, overlapping, or under 13px?
6. Does a click or tap on a tile, link, or tag do what a click on its row or region does? Decorative layers should pass pointer events through.
7. Is there a mark the caption does not explain?
8. Does it still use only the article's existing vocabulary?

Fix what you find, then show the author. Say what you checked by screenshot and what you did not.

## 8. When the author corrects it

A correction to one diagram is usually a rule for all of them. When a comment names a pattern ("icons by type", "this should be a caption", "use the style from the other figure"), apply it to every figure in the article in the same pass and say that you did. If the author asks for a restyle across many figures, redraw one, show it, then do the rest against the shared kit so they stay consistent. Keep facts fixed while changing form, and list anything that changed form (a count that became a badge, a bare line that gained a tag).
