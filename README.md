# moonshine

**A skill for distilling interactive technical explanations from AI generated complexity.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

AI tools generate complexity faster than people can consume it. Inspired by [Distill.pub](https://distill.pub), moonshine helps apply distillation to the flood of technical output, turning complex ideas into explorable, visual, interactive articles.

```
> /shine how gradient descent finds minima
What is the key insight you want the reader to walk away with?
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
cp -r /tmp/moonshine/plugins/moonshine ~/.claude/skills/moonshine
rm -rf /tmp/moonshine
```

## Usage

Run `/shine` to start a new explanation. Moonshine will ask you questions about the concept, audience, and key insight before writing any code.

```
/shine                              # start from scratch
/shine fourier transforms           # start with a topic
```

## What It Does

The `/shine` command guides you through:

1. **Story discovery** Clarify the concept, audience, key insight, and progression of understanding
2. **Interaction design** Decide where static prose, interactive explorations, linked views, and scroll-driven narrative serve the explanation best
3. **Project scaffolding** Generate a complete React 18 + Vite + D3 + TypeScript project
4. **Iterative building** Start with prose and static figures, add interaction only where it genuinely helps

Moonshine uses [d3-power-tools](https://github.com/syntagmatic/d3-power-tools) for visualization, a collection of specialized D3 skills covering linked views, brushing, force layouts, cartography, and more. Both are available from the same marketplace.

## Project Structure

```
plugins/
└── moonshine/
    ├── SKILL.md          skill workflow and design principles
    ├── RESEARCH.md       background research and inspiration catalog
    └── commands/
        └── shine.md      /shine command definition
```

## Inspirations

- [Distill.pub, "Research Debt"](https://distill.pub/2017/research-debt/) — Why distillation matters
- [Mike Bostock](https://bost.ocks.org/mike/) — D3.js and interactive articles
- [Bret Victor](http://worrydream.com/ExplorableExplanations/) — Explorable explanations
- [Nicky Case](https://ncase.me/) — Playful interactive explanations
- [Bartosz Ciechanowski](https://ciechanow.ski/) — Long-form interactive explanations
- [The Pudding](https://pudding.cool/) — Data-driven visual essays

## License

MIT
