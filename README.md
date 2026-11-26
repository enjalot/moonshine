# moonshine

**Turn complex technical ideas and AI-generated output into interactive, Distill-style articles you can edit directly on the page.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

### [See examples at enjalot.github.io/moonshine](https://enjalot.github.io/moonshine/)

Source-backed `still` examples:
[The Still: Moonshine's Harness](https://enjalot.github.io/moonshine/moonshine-guide/)
([source](examples/moonshine-guide/)) and
[A Map of What Children Learn](https://enjalot.github.io/moonshine/os-taxonomy-map/)
([source](examples/os-taxonomy-map/)).

AI tools generate code, architecture docs, and experiments faster than people can consume them. Inspired by [Distill.pub](https://distill.pub), moonshine applies distillation to that complexity: your coding agent interviews you about the concept, audience, and key insight before writing code, then builds an explorable article with prose that drives understanding and interactive figures that serve the argument.

Works with **Antigravity**, **Claude Code**, and **Codex**.

## What you can build

- **Algorithm and math explainers** with live simulations, step-by-step progressions, and draggable figures where pulling an output drives the inputs ([Smoothed Particle Hydrodynamics](https://enjalot.github.io/moonshine/sph/), [Approximate Nearest Neighbors](https://enjalot.github.io/moonshine/ann/)).
- **Dataset and embedding essays** with scrollytelling tours, linked views, and WebGL canvases over tens of thousands of points ([A Map of What Children Learn](https://enjalot.github.io/moonshine/os-taxonomy-map/), [Moments on a manifold](https://enjalot.github.io/moonshine/moments/), [Latent Verse](https://enjalot.github.io/moonshine/latent-verse/)).
- **System and architecture explainers** with icon-tile diagrams (built-in glyphs, 5,000 Tabler icons, or emoji), colour-coded link families, and a direct-manipulation editor so you never fight Mermaid layouts.
- **Multi-part field guides** with typed frontmatter, automatic series index cards, and consistent visual conventions across chapters ([What Dimensionality Reduction Preserves](https://enjalot.github.io/moonshine/dim-reduction/)).
- **Co-authored living articles** where human edits in the browser and agent edits in files share one git history, targeted comments, and word-diff review suggestions ([The Still: Moonshine's Harness](https://enjalot.github.io/moonshine/moonshine-guide/)).

## Two substrates: `still` and `shine`

- **`still`** (default) — a Vite + React + Velite project where prose lives in pristine markdown and figures are React components. This is where the direct-manipulation authoring loop lives, and the right choice for any article that will keep being edited.
- **`shine`** — a single self-contained HTML file with vanilla JS and D3 from CDN. No build step; one file you can email or host anywhere.

```shell
# Antigravity
/still how gradient descent finds minima

# Claude Code
/moonshine:still how gradient descent finds minima

# Codex
$still how gradient descent finds minima
```

## The authoring loop (`still`)

During `npm run dev`, the rendered article is itself the editing surface for both the author and the agent. Everything below is dev-only: `vite build` emits a plain, read-only static site with none of the editing machinery in the bundle.

### Prose and structure
- **Edit prose in place.** Cmd/Ctrl+click any block (paragraph, heading, list, caption, title/lede) to edit its raw markdown right where it renders. Saves splice back into the `.md` by source offset, leaving directives untouched.
- **Reorder blocks.** Cmd/Ctrl+drag any block (or use ↑/↓ in the editor) to move it: the block lifts and the others slide apart to show where it lands, and the markdown is rewritten.
- **Insert content with "+".** Hover between blocks to add a paragraph, a new diagram, or an uploaded image straight into the markdown.
- **Edit on a tablet or phone.** Without a keyboard, touch and hold a block to edit it, keep holding and drag to reorder, and tap between blocks for "+". The diagram editor pans with one finger and zooms with a pinch.

### Figures and diagrams
- **Tune figures with knobs.** Cmd/Ctrl+click a figure to open a control panel generated from its exported `DEFAULTS`; **Save to markdown** writes tweaked values into the directive's attributes.
- **Arrange diagrams by hand.** The agent declares a small `DiagramSpec` (nodes, links, groups) using labelled boxes or icon tiles (built-in glyphs, Tabler icons, or emoji). You arrange and restyle it in a dev-only editor with alignment guides, live arrow re-routing, group drop zones, a reader frame, and a separate narrow layout for phones. Regenerating the spec never clobbers your arrangement, and readers get live SVG with labels at ≥13px and no layout engine in the production bundle.
- **Build draggable figures declaratively.** Interactive drags use [Dragology](https://declarative-dragging.github.io): a figure declares which states dragging an element can reach, so readers can drag an output (a point on a computed path) and watch the inputs follow.

### Co-authoring with the agent
- **Git as shared memory.** Every browser save auto-commits with a `moonshine-edit:` prefix, so the agent reads what you changed and builds around your words instead of overwriting them.
- **Comments to the agent.** The 💬 button on any passage or figure writes a targeted note to `.feedback/`. Comments accumulate until you press **Address** in the HUD, which routes them back to the authoring session via a Stop hook or idle listener.
- **Suggestions from the agent.** After an editing pass or critique, the agent can leave word-diff suggestion cards under passages instead of editing your words directly. You **Accept**, **Edit**, or **Reject** each one in the page, or send a remark back as a comment.

## Skills at a glance

| Skill | What it does | Antigravity | Claude Code | Codex |
|---|---|---|---|---|
| **still** | Interview, scaffold, and iterate on a Vite + React + Velite article | `/still` | `/moonshine:still` | `$still` |
| **shine** | Interview and build a single self-contained HTML + D3 article | `/shine` | `/moonshine:shine` | `$shine` |
| **diagram** | Design and build a system, relationship, or process diagram for a `still` article | `/diagram` | `/moonshine:diagram` | `$diagram` |
| **critique** | Adversarially grade an article (S–F) against editorial, visual, and pedagogy rules | `/critique` | `/moonshine:critique` | `$critique` |
| **moonshine-listen** | Idle-time feedback listener that heartbeats and drains comments from the HUD | `/moonshine-listen` | `/loop /moonshine:moonshine-listen` | `$moonshine-listen` |

Moonshine starts every article with story discovery (concept, audience, key insight, progression) before scaffolding, then builds one section at a time with checkpoints. Editorial craft (`EDITORIAL.md`), anti-slop, and Honest Figures rules live in the skill and apply to everything it writes.

## Install

### Antigravity

Install directly from GitHub (registers all 6 skills and the native Antigravity Stop hook):

```bash
agy plugin install https://github.com/enjalot/moonshine/tree/main/plugins/moonshine
```

Or from a local checkout:

```bash
agy plugin install ./plugins/moonshine
```

Verify with `agy plugin list`. In Antigravity chat, invoke `/still`, `/shine`, `/diagram`, `/critique`, or `/moonshine-listen`, or simply describe the interactive explanation you want.

### Claude Code and Codex

**Marketplace (recommended — includes the Stop hook):**

```shell
/plugin marketplace add enjalot/moonshine
/plugin install moonshine@moonshine-marketplace
```

Restart the session. Claude Code invokes with `/moonshine:still` and `/moonshine:shine`; Codex invokes with `$still` and `$shine` (or describe the article you want).

**Manual install (degraded — skills only, no Stop hook):**

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
ln -s /tmp/moonshine/plugins/moonshine/skills/critique         ~/.codex/skills/critique
ln -s /tmp/moonshine/plugins/moonshine/skills/diagram          ~/.codex/skills/diagram
# (use `cp -rL` instead of `ln -s` if you don't want to keep the clone around)
```

> **Caveat:** a skills-directory install registers the skills but **not the plugin's Stop hook**, so feedback comments are only picked up when the listener skill runs or when you ask the agent directly. Everything else works.

> **Windows note:** this repo uses git symlinks for shared skill assets. Run `git config --global core.symlinks true` before cloning.

To develop against your checkout instead, see [DEVELOPING.md](DEVELOPING.md) (local install, dev harness, repo map).

## Output

Projects live in `~/.agent/moonshine/<project-name>/`. A `still` project is a complete Vite app (markdown in `content/`, figures in `src/figures/`) whose `npm run build` emits a static site; a `shine` article is a self-contained `index.html` plus an optional `data/` directory. Publishing recipes (domain root, subpath, or this repo's Pages site) are in [STILL.md](plugins/moonshine/STILL.md) and [DEVELOPING.md](DEVELOPING.md).

[`directory/`](directory/) is an optional LAN dashboard for the machine hosting your articles: it indexes everything under `~/.agent/moonshine` (each article's `moonshine.meta.json`), lists running web servers with their authoring session, and can start a stopped article's dev server from the browser. One stdlib-Python process, Linux + macOS — see [directory/README.md](directory/README.md).

## Developing

To work on the skill itself — run the `still` template in-repo as a live dev harness, validate plugins, extend figures/directives/the edit pipeline, publish examples, or cut a release — see [DEVELOPING.md](DEVELOPING.md).

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
