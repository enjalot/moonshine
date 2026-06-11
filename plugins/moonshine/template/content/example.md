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

:::figure{id=loss-landscape}
A two-well loss surface. Drag or click to set a starting point and
watch the descent path settle into the nearest minimum.
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
loss and gradient computed, parameters updated. Repeat.
:::

The full picture is just this loop, run for thousands of iterations
with a step size that shrinks as the loss flattens.
