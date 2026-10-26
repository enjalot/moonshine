---
title: How Gradient Descent Finds Minima
description: A short walk through why a simple rule beats searching at random.
tags:
  - optimization
  - calculus
---

The loss landscape has hills and valleys. Most learning algorithms find
their way downhill not by searching everywhere, but by following the
local slope.

:::figure{id=loss-landscape lr=0.12}
### Descending a two-well surface
A two-well loss surface. Drag or click to set a starting point and
watch the descent path settle into the nearest minimum. The step size
here is set right in the markdown (`lr=0.12`) — every figure attribute
becomes a prop, and the heading on the first line renders as the
figure's title.
:::

Random search is inefficient because the parameter space is too large.
The :term[gradient]{to=gradient-field.well} of the loss tells you which
direction to step — every arrow in the basin of a minimum points toward
that minimum.

:::figure{id=gradient-field}
At every point, the gradient is an arrow pointing in the direction of
steepest ascent. Gradient descent moves in the opposite direction.
:::

The size of each step matters. Too small and progress stalls
:inline-viz{kind=mini-spark value=0.15}; too large and you overshoot
:inline-viz{kind=mini-spark value=0.92} the minimum entirely. Tuning
this :term[step size]{to=flow-diagram.update} is most of what makes
optimizers differ from each other. It is the $\eta$ in the update rule:

$$
\theta_{t+1} = \theta_t - \eta \, \nabla L(\theta_t)
$$

:::figure{id=flow-diagram}
One iteration of gradient descent as a small data flow: parameters in,
loss and gradient computed, parameters updated. Repeat. The figure file
declares only the nodes and edges; during `npm run dev`, click arrange to
position them, pick edge sides, add notes, and crop the frame. Readers get
the live diagram with that arrangement.
:::

The full picture is just this loop, run for thousands of iterations
with a step size that shrinks as the loss flattens. How much the step
size matters shows up in a plain table, with no figure needed:

| Step size η | Steps to converge | Final loss | Outcome |
| --- | --- | --- | --- |
| 0.01 | 1,840 | 0.0031 | converges slowly |
| 0.12 | 96 | **0.0004** | converges |
| 0.45 | 31 | 0.0122 | oscillates, then settles |
| 0.90 | — | 7.3 × 10³ | diverges |

Number columns are detected and right-aligned with tabular figures, so
the decimal places line up without any per-table CSS. A table with six
or more columns breaks out of the text column the way a wide figure does,
and scrolls sideways on a phone:

| Optimizer | η | β₁ | β₂ | Steps | Wall time | Final loss |
| --- | --- | --- | --- | --- | --- | --- |
| SGD | 0.12 | — | — | 96 | 0.8 s | 0.0004 |
| Momentum | 0.12 | 0.9 | — | 41 | 0.4 s | 0.0002 |
| Adam | 0.01 | 0.9 | 0.999 | 58 | 0.6 s | 0.0003 |

:::figure{id=sparkline seed=0.7}
A seeded random walk standing in for a loss curve. The seed is set in
the directive (`seed=0.7`); during `npm run dev`, Cmd/Ctrl+click the
figure to dial it with the knob panel and save the value back to this
file.
:::

During `npm run dev`, hovering the gap between two blocks shows a **+**.
It adds a paragraph, a diagram (boxes and arrows you build in the same
editor as the one above), or an uploaded image right there in the
markdown, and 💬 on the new block asks the agent to adjust it.
