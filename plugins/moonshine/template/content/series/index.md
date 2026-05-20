---
title: A Tour of Optimization
description: How three methods find minima — gradient descent, momentum, and Adam.
series: optimization
order: 0
---

Most learning problems reduce to: find the parameters that make this
number small. The number is the loss. The parameters live in a
high-dimensional space. The space is mostly empty.

This short series walks through three optimizers, in order of
sophistication. Each takes the last as its starting point.
