# moonshine

**A skill for distilling interactive technical explanations from AI generated complexity.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

### 🌕 [See examples at enjalot.github.io/moonshine](https://enjalot.github.io/moonshine/)

AI tools generate complexity faster than people can consume it. Inspired by [Distill.pub](https://distill.pub), moonshine helps apply distillation to the flood of technical output, turning complex ideas into explorable, visual, interactive articles.

Each explanation is a self-contained HTML file with vanilla JS and D3 v7. No build tools, no frameworks. Open the file in a browser and it works.

```
> /moonshine:shine how gradient descent finds minima
What is the key insight you want the reader to walk away with?
```

## Install

**Claude Code (marketplace):**
```shell
/plugin marketplace add enjalot/moonshine
/plugin install moonshine@moonshine-marketplace
```

**Manual install:**
```bash
git clone --depth 1 https://github.com/enjalot/moonshine.git /tmp/moonshine
cp -r /tmp/moonshine/plugins/moonshine ~/.claude/skills/moonshine
rm -rf /tmp/moonshine
```

## Usage

Run `/moonshine:shine` to start a new explanation. Moonshine will ask you questions about the concept, audience, and key insight before writing any code.

```
/moonshine:shine                              # start from scratch
/moonshine:shine fourier transforms           # start with a topic
```

## What It Does

The `/moonshine:shine` command guides you through:

1. **Story discovery** Clarify the concept, audience, key insight, and progression of understanding
2. **Interaction design** Decide where static prose, interactive explorations, linked views, and scroll-driven narrative serve the explanation best
3. **Project scaffolding** Generate a self-contained HTML file with D3 visualizations and moonshine typography
4. **Iterative building** Start with prose and static figures, add interaction only where it genuinely helps

Moonshine includes a built-in D3 visualization reference (`VISUALS.md`) covering chart types, interaction patterns, and the editorial style foundation.

## Output

Each explanation lives in `~/.agent/moonshine/project-name/`:

```
~/.agent/moonshine/project-name/
  index.html          # Self-contained explanation
  data/               # Optional external datasets
```

## Project Structure

```
plugins/
└── moonshine/
    ├── SKILL.md          editorial process, story discovery, anti-slop rules
    ├── ARTICLE.md        HTML scaffold, CSS foundation, layout patterns, series structure
    ├── VISUALS.md        D3 visualization patterns, interaction, rendering, iteration
    └── commands/
        └── shine.md      /moonshine:shine command definition
```

## Inspirations

- [Distill.pub, "Research Debt"](https://distill.pub/2017/research-debt/) — Why distillation matters
- [Mike Bostock](https://bost.ocks.org/mike/) — D3.js and interactive articles
- [Bret Victor](http://worrydream.com/ExplorableExplanations/) — Explorable explanations
- [Red Blob Games](https://www.redblobgames.com/) — Interactive algorithm and game-dev explainers
- [Nicky Case](https://ncase.me/) — Playful interactive explanations
- [Bartosz Ciechanowski](https://ciechanow.ski/) — Long-form interactive explanations
- [The Pudding](https://pudding.cool/) — Data-driven visual essays
- [visual-explainer](https://github.com/nicobailon/visual-explainer) — Anti-slop patterns for AI-generated visual output

## License

MIT
