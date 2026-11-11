---
title: A Map of What Children Learn
description: 1,590 school topics, arranged by meaning instead of by timetable.
tags:
  - education
  - embeddings
  - visualization
---

Marble published [an open dataset](https://github.com/withmarbleapp/os-taxonomy) of what children
learn across the primary years: 1,590 micro-topics, each a single teachable idea like
*Unit fractions* or *What Is a Volcano*, wired together by 3,221 prerequisite edges, each edge
carrying a one-line reason.

We made a semantic map of those topics. Each topic's name and description was embedded with a
sentence-embedding model, then projected from 768 dimensions down to two with UMAP, using
[Latent Scope](https://github.com/enjalot/latent-scope). Topics whose descriptions are similar land
near each other. The layout was never shown the subject labels, the age ranges, or the prerequisite
graph, so we can ask how much of that structure the words alone recover.

## Finding the subjects on the map

::::scrolly-tour{id=taxonomy-tour}
:::step
Each of these 1,590 dots is one micro-topic. Uncolored, the map is a few landmasses with bays and
peninsulas.
:::

:::step
When we color each dot by its subject, the landmasses turn out to be subjects. Science fills the
north, Mathematics holds the west, English runs along the south, and History sits on the east coast.

The placement of the dots had no awareness of the subjects. Topics about plants read more like each
other than like topics about commas or historical figures. The four smaller subjects, Personal &
Social Development, Life Skills, Computing, and Learning to Learn, gather in the interior between
Mathematics and English.
:::

:::step
Zooming into the east coast, the continent resolves into towns. Ancient Egypt forms its own cluster
of 31 topics, next door to Ancient Greece and Rome.

There is one green dot among the brown. *Pompeii & Vesuvius* is filed under Science in the
taxonomy, but its description put it here, with the Romans. Its three volcano prerequisites are on
the far side of the map.
:::

:::step
Following those three edges takes us to the northern edge of Science, where *What Is a Volcano*,
*Inside a Volcano* and *Power of Eruptions* sit together. The taxonomy files Pompeii with these
three, and the map put it with Rome.
:::

:::step
Some towns sit right on a border. *Coins & Notes* is a Life Skills topic and *Coin Values* is
Mathematics, yet the closest dot to *Coins & Notes* on the whole map is *Coin Values*, which is
also one of its prerequisites. Both descriptions are about the same coins, so the map sets them
side by side across the department boundary.
:::

:::step
Now we color by starting age instead. Topics that start at age 4 or 5 are dark purple: counting,
pencil grip, naming feelings. Topics that start later, like single-celled organisms or simplifying
fractions, are brighter, up to yellow at 13. Every continent has both dark and bright regions, so
age varies within each subject and doesn't sort the map as a whole.
:::

::::

## How the map fills in with age

The taxonomy opens with only 41 topics at :term[age 4]{to=age-map.age-4}, 20 in English and 21 in
Mathematics: letter sounds and rhymes in the south, counting and shapes in the west.
:term[Age 5]{to=age-map.age-5} adds 256 topics in all eight subjects and reaches every continent,
which is why the figure below opens there. The typical topic that opens at 5 sits 14% of the map's
width from anything that was open at 4. From :term[age 6]{to=age-map.age-6} onward that distance is
under 1%, so each later year fills in beside topics that are already open and the outline of the
map hardly changes.

The bars under the map show a rhythm in the starting ages. Ages 5, 7 and 9 each open more than 250
topics, and the even years between them open about half as many. Most of the swing comes from
Science, which opens 100 or more topics at each of :term[5]{to=age-map.age-5},
:term[7]{to=age-map.age-7} and :term[9]{to=age-map.age-9} and fewer than 40 in the years between,
while Mathematics adds a steadier 64 to 80 topics a year from age 6 to 10. The dataset doesn't say
why Science comes in two-year blocks.

:::figure{id=age-map}
### Figure 2. Topics opening at each age
Bright dots open at the selected age, faded dots opened earlier, and gray dots are still to come.
At age 5 the bright dots already reach every continent, and each later year fills in around them.
The gray lines are the prerequisites of the topics opening this year. In 98% of the taxonomy's
edges the prerequisite starts at the same age or earlier, so the lines mostly run back into
territory that is already colored.
:::

## Comparing the prerequisite graph with the map

The taxonomy's 3,221 prerequisite edges were authored topic by topic, each with a written reason.
We didn't show those to the embedding model, yet drawn on the map, 95% of edges connect two topics
of the same subject, and the median edge spans about 2% of the map's width. Topics that have to be
learned in sequence are usually about the same thing, so the handmade graph and the semantic layout
agree almost everywhere.

That agreement makes the exceptions easy to spot. The three longest edges on the map all leave
Ancient Egypt, and the next five all involve Pompeii, four of them through
:term[Pompeii & Vesuvius]{to=explorer.pompeii}.
:term[Egyptian Maths and Engineering]{to=explorer.egyptian-maths} reaches across to
:term[Unit fractions]{to=explorer.unit-fractions}, because the Rhind Mathematical Papyrus works
extensively with unit fractions, and :term[Pyramids and the Great Sphinx]{to=explorer.pyramids}
reaches to :term[3-D shapes]{to=explorer.three-d-shapes}. The explorer below opens with Egyptian
Maths and Engineering selected. Its two direct prerequisites lead back through 58 topics, and 50 of
those are in Mathematics on the other side of the map.

The taxonomy's authors seem to treat these crossings differently too. Every edge is marked hard or
soft, and 66% of the edges inside a subject are hard. Only 161 edges cross from one subject to
another, and 3 of those are hard. The explorer's side panel shows the mark and the written reason
for each edge of the selected topic, and the edge to Unit fractions is a soft one.

:::figure{id=explorer}
### Figure 3. Prerequisites drawn on the map
Solid lines run from the selected topic back through every ancestor, and dashed lines run forward
to what it unlocks. For Egyptian Maths and Engineering, one line crosses the whole map to Unit
fractions and then fans out inside Mathematics. A language model generated the cluster names, so
read them as rough signposts.
:::

## Making your own map

This map was made with [Latent Scope](https://github.com/enjalot/latent-scope): you can point your
agent at it and ask it to map your own data. The article around the map was made with the
[Moonshine](https://github.com/enjalot/moonshine) skill.
