# moonshine

**A skill for distilling interactive technical explanations from AI generated complexity.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

AI tools generate complexity faster than people can consume it. Inspired by [Distill.pub](https://distill.pub), moonshine helps apply distillation to the flood of technical output, turning complex ideas into explorable, visual, interactive articles.

```
> /moonshine
What are you trying to explain?
```

## Install

**Claude Code (marketplace):**
```shell
# Add the marketplace and install both skills
/plugin marketplace add enjalot/moonshine
/plugin install moonshine@moonshine-marketplace
/plugin install d3-power-tools@moonshine-marketplace
```

**Manual install:**
```bash
git clone --depth 1 https://github.com/enjalot/moonshine.git /tmp/moonshine

# Install skill
cp -r /tmp/moonshine/plugins/moonshine ~/.claude/skills/moonshine

rm -rf /tmp/moonshine
```

## What It Does

When you invoke `/moonshine`, the skill guides you through:

1. **Story discovery** — Clarify the concept, audience, key insight, and progression of understanding
2. **Interaction design** — Decide where static prose, interactive explorations, linked views, and scroll-driven narrative serve the explanation best
3. **Project scaffolding** — Generate a complete React 18 + Vite + D3 + TypeScript project
4. **Iterative building** — Start with prose and static figures, add interaction only where it genuinely helps

## Tech Stack

- **React 18** — Component model and hooks
- **Vite** — Fast dev server and optimized builds
- **D3.js** — Data visualization primitives
- **TypeScript** — Type safety for data schemas and component props

## Design Principles

- **Every interaction must serve understanding.** If a slider doesn't help the reader build intuition, remove it.
- **Information hierarchy is self-evident.** Use typography, spacing, and visual weight so readers know what matters most without reading a word.
- **Consistent visual language.** All figures in an article share scales, colors, and conventions.
- **Margin notes over footnotes.** Keep supplementary info visible without disrupting flow.

## Interaction Patterns

| Pattern | Use When |
|---------|----------|
| Details-on-demand | Supplementary info would clutter the narrative |
| Explorable explanation | The concept involves a parameter space to explore |
| Linked views | The same data has multiple meaningful representations |
| Scroll-driven narrative | The explanation has a natural sequence of reveals |
| Animated transition | The path between two states is meaningful |

## Project Structure

```
plugins/
└── moonshine/
    ├── SKILL.md       ← skill workflow and design principles
    └── RESEARCH.md    ← background research and inspiration catalog
```

## Inspirations

- [Distill.pub](https://distill.pub) — Research distillation as valuable creative work
- [Bret Victor](http://worrydream.com/ExplorableExplanations/) — Explorable explanations
- [3Blue1Brown](https://www.3blue1brown.com/) — Visual mathematical explanations
- [Nicky Case](https://ncase.me/) — Playful interactive explanations
- [Bartosz Ciechanowski](https://ciechanow.ski/) — Long-form interactive explanations
- [The Pudding](https://pudding.cool/) — Data-driven visual essays

## License

MIT
