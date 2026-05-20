---
title: Gradient Descent
description: Follow the slope, one step at a time.
series: optimization
order: 1
tags:
  - gradient descent
---

Gradient descent is the simplest optimizer. At every point on the loss
surface, compute which direction is downhill and step that way.

:::figure{id=gradient-field}
The downhill direction at every point on a synthetic loss surface.
:::

The :term[step size]{to=flow-diagram.update} controls how aggressive
each move is. Too small :inline-viz{kind=mini-spark value=0.1} and
convergence is slow; too large :inline-viz{kind=mini-spark value=0.95}
and you overshoot.

:::figure{id=flow-diagram}
One iteration as a small data flow: parameters in, loss and gradient
computed, parameters updated. Repeat.
:::
