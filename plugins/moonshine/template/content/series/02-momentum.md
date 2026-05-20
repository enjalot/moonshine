---
title: Momentum
description: Borrow velocity from previous steps.
series: optimization
order: 2
tags:
  - momentum
---

Momentum is gradient descent plus inertia. Each update carries forward
a fraction of the previous update, like a ball rolling down the
surface.

:::figure{id=loss-landscape}
The same surface, now with a starting point you can click to set. The
descent path bends naturally toward the nearest minimum.
:::

The intuition: gradient descent is pure local response. Momentum adds
memory — useful for crossing flat regions and damping oscillations
across narrow valleys.
