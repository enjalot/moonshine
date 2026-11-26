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
The same surface, now with a starting point you can drag to move. The
descent path bends naturally toward the nearest minimum.
:::

Gradient descent responds only to the local slope. Momentum adds
memory, which helps cross flat regions and damp oscillations
across narrow valleys.
