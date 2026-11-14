---
title: Diagrams
description: What the built-in diagram can draw, one small example each.
tags:
  - diagrams
---

A diagram in a still article is a short spec in a figure file: the nodes,
the links between them, and the groups they sit in. The author arranges
it in the browser. During `npm run dev`, **edit diagram** under any figure
here opens the editor; everything on this page can be changed there and
saved.

## The pieces on their own

A diagram does not need links. Before a system is drawn, a figure can
introduce its vocabulary: each kind of thing, with the icon that will
stand for it everywhere after.

:::figure{id=dg-vocabulary}
Eight kinds of thing. The colour is the kind's family: blue for what
runs, green for what holds data, orange for what controls, purple for
access.
:::

## A system

Each node is a tile: an icon for the kind of thing it is, with its name
outside. The name belongs to the tile and moves with it. Links are
coloured by what they carry, and each label carries a mark for the
direction, so a label read alone still says who acts on whom.

:::figure{id=dg-system}
### An order, from the shop to the print partner
Blue links carry requests and green ones carry data. The two-headed link
is read and written. The dashed tile and link are a proofing step that
does not exist yet, and the badge counts four renderer workers. Hover the
renderer for a note.
:::

## What a link can say

:::figure{id=dg-links}
One way, both ways, and no direction at all, which is right for a
relation such as "same region". A dashed link is permitted or planned,
and here it is purple because it is about access.
:::

## Boundaries

A group draws a boundary around its nodes: an account, a team, a
machine. In the editor the **Group** tool adds one, dragging a node across
the boundary moves it in or out, and the toolbar sets how the boundary
is drawn.

:::figure{id=dg-zones}
The four boundary styles, each in one colour family: an outline, corner
marks, a tinted area, and a dashed outline for something planned.
:::

## Any icon

A tile's icon can be one of the built-in glyphs, any emoji, or any of
the 5,000 Tabler icons, written `tabler:flame`. In the editor, type an
emoji into the icon field or type a word to search the Tabler set. Only
the icons an article uses are shipped to readers.

:::figure{id=dg-any-icon}
Emoji for grain, barrel and taster, and Tabler icons for the mash, the
still and the bottle. The taster's name sits to the right of its tile.
:::

## Labelled boxes

When a node is a sentence, a decision or a formula, an icon would only
get in the way. Leave `icon` off and the node is a box, in one of seven
kinds.

:::figure{id=dg-boxes}
A decision with a double border, the highlighted outcome, a store, an
external party with a dotted outline, and a note. The animated link is
the one the prose would be about.
:::
