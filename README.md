# moonshine

**Claude Code and Codex support for distilling interactive technical explanations from AI generated complexity.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

### 🌕 [See examples at enjalot.github.io/moonshine](https://enjalot.github.io/moonshine/)

AI tools generate complexity faster than people can consume it. Inspired by [Distill.pub](https://distill.pub), moonshine helps apply distillation to the flood of technical output, turning complex ideas into explorable, visual, interactive articles.

Moonshine starts with story discovery — concept, audience, the one insight the reader should walk away with — before it writes any code, and renders the article on one of two substrates:

- **still** (`/moonshine:still`) — a Vite + React + Velite project where prose lives in pristine markdown and figures are React components. This is the substrate with the authoring loop (below) and the default for anything that will keep being edited.
- **shine** (`/moonshine:shine`) — a single self-contained HTML file with vanilla JS and D3. No build tools; one file you can email or host anywhere.

```shell
# Claude Code
/moonshine:still how gradient descent finds minima

# Codex
$still how gradient descent finds minima
```

## The authoring loop (still)

While `npm run dev` runs, the rendered article is itself the editing surface, for both the author and the agent:

- **Edit prose in place.** Cmd/Ctrl+click any block to edit its raw markdown in the page; saves splice back into the `.md` by source offset.
- **Tune figures with knobs.** Cmd/Ctrl+click a figure to open a panel generated from its `DEFAULTS`; "Save to markdown" writes the tweaked values into the directive's attributes.
- **Reorder sections.** Cmd/Ctrl+drag any block (or use ↑/↓ in the editor) to move it; the markdown is rewritten.
- **Arrange diagrams.** Node-link figures built on `DiagramFigure` (React Flow) get an author-owned layout: drag nodes, frame the viewport, save. Regenerating the diagram's code never clobbers the arrangement.
- **Git as shared memory.** Every browser save auto-commits with a `moonshine-edit:` prefix, so the agent can see exactly what the author changed and build around their words.
- **Comments back to the agent.** The 💬 affordance sends feedback ("this is too hand-wavy") into `.feedback/` files that the agent picks up at turn boundaries (Stop hook) or via the idle listener (`/moonshine:moonshine-listen`).

All of it is dev-only: `vite build` produces a plain, read-only static page with none of the editing machinery in the bundle.

## Install

**Marketplace (Claude Code, and Codex via the same marketplace):**
```shell
/plugin marketplace add enjalot/moonshine
/plugin install moonshine@moonshine-marketplace
```

Restart the session. Claude Code invokes with `/moonshine:still` and `/moonshine:shine`; Codex with `$still` and `$shine` (or just describe the article you want).

**Manual install (degraded — read the caveat):**

```bash
# Claude Code
git clone --depth 1 https://github.com/enjalot/moonshine.git /tmp/moonshine
cp -r /tmp/moonshine/plugins/moonshine ~/.claude/skills/moonshine
rm -rf /tmp/moonshine

# Codex
git clone --depth 1 https://github.com/enjalot/moonshine.git /tmp/moonshine
ln -s /tmp/moonshine/plugins/moonshine/skills/moonshine        ~/.codex/skills/moonshine
ln -s /tmp/moonshine/plugins/moonshine/skills/shine            ~/.codex/skills/shine
ln -s /tmp/moonshine/plugins/moonshine/skills/still            ~/.codex/skills/still
ln -s /tmp/moonshine/plugins/moonshine/skills/moonshine-listen ~/.codex/skills/moonshine-listen
# (use `cp -rL` instead of `ln -s` if you don't want to keep the clone around)
```

> **Caveat:** a skills-directory install registers the skills but **not the plugin's Stop hook**, so feedback comments are only picked up when the listener skill runs — the automatic turn-boundary delivery needs the marketplace install. Everything else works.

> **Windows note:** this repo uses git symlinks for shared skill assets. Run `git config --global core.symlinks true` before cloning.

To develop against your checkout instead, see [DEVELOPING.md](DEVELOPING.md) (symlink install, dev harness, repo map).

## Usage

```
/moonshine:still                    # start from scratch (structured project)
/moonshine:still fourier transforms # start with a topic
/moonshine:shine fourier transforms # single-file flavor
/moonshine:moonshine-listen         # feedback listener (best under /loop)
```

Moonshine asks about the concept, audience, and key insight before scaffolding, then builds one section at a time with checkpoints. The editorial rules (anti-slop, the editing pass) live in the skill and apply to everything it writes.

## Output

Projects live in `~/.agent/moonshine/<project-name>/`. A still project is a complete Vite app (markdown in `content/`, figures in `src/figures/`) whose `npm run build` emits a static site; a shine article is a self-contained `index.html` plus an optional `data/` directory. Publishing recipes — domain root, subpath, or this repo's Pages site — are in `STILL.md` § Publishing and `DEVELOPING.md`.

[`directory/`](directory/) is an optional LAN dashboard for the machine hosting the articles: it indexes everything under `~/.agent/moonshine` (each article's `moonshine.meta.json` — title, intent, authoring session), lists every other running web server with its Claude session, and can start a stopped article's dev server from the browser. One stdlib-Python process, Linux + macOS — see its README.

## Developing

To work on the skill itself — run the `still` template in-repo as a live dev harness, install from your checkout, extend figures/directives/the edit pipeline, publish examples, or cut a release — see [DEVELOPING.md](DEVELOPING.md), which also carries the current repo map.

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
