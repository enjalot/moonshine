# Developing moonshine

How to work on the skill itself: run the template in-repo, see your changes
live, and extend the built-in functionality. This applies equally to human
contributors and coding agents working on this repo.

## Install the skill from your checkout

The plugin marketplace install gives you a snapshot; for development you want
the live skill to track your working tree. Symlink it:

```bash
# Claude Code
rm -rf ~/.claude/skills/moonshine
ln -s "$(pwd)/plugins/moonshine" ~/.claude/skills/moonshine
```

Restart your session and `/moonshine:shine`, `/moonshine:still` pick up edits
to `SKILL.md`, `STILL.md`, the commands, and the template immediately — no
reinstall step.

## The dev harness: run the template in place

The `still` template at `plugins/moonshine/template/` is itself a runnable
project, and its example content (`content/example.md`, `content/series/`)
demonstrates every built-in feature: the three directives, term→figure
highlighting, the figure registry, and in-place prose editing. Run it directly
to develop against it:

```bash
cd plugins/moonshine/template
npm install
npm run dev          # localhost only
npm run dev:lan      # binds 0.0.0.0 for browsing from another device
```

With `dev:lan` on a LAN, open `http://<hostname>.local:5173` (mDNS hostnames
under `.local` are allowed through Vite's host check) or the machine's IP.

The dev server uses `strictPort: true`. If you already have an article project
running on 5173, give the harness its own port:

```bash
MOONSHINE_PORT=5180 npm run dev:lan
```

Two watchers run concurrently: Velite re-emits typed content on any
`content/**/*.md` change, and Vite hot-swaps anything under `src/`. Either
side reloads without disturbing the other.

> **Security note:** `dev:lan` exposes the dev server — including the
> `/__moonshine/save` write endpoint — to your local network. Use it on
> networks you trust.

### The example content is the regression surface

When you add built-in functionality, demonstrate it in the example content
(`content/example.md` or the series). The harness page is how reviewers and
future contributors eyeball that everything still works; a feature that isn't
visible there is a feature that will silently break.

### Verify before pushing

```bash
cd plugins/moonshine/template
npm run typecheck    # tsc over src/ and the node-side configs
npm run build        # velite + tsc + vite build — must stay green
```

A production build must contain no edit affordances: everything is gated on
`import.meta.env.DEV` and the save middleware is `apply: 'serve'`. If you add
dev-only behavior, follow that pattern.

## How template changes propagate

`/moonshine:still` copies `template/` into `~/.agent/moonshine/<project>/` at
bootstrap (excluding `node_modules/`, `.velite/`, `dist/`). Existing projects
do **not** update when the template changes — they own their copy. To bring an
existing article up to date, copy the changed files under `src/` and the
configs into the project, or diff against the template and cherry-pick.

## Repo map

```
plugins/moonshine/
  SKILL.md          editorial process, story discovery, anti-slop rules
  ARTICLE.md        single-file HTML scaffold (the `shine` substrate)
  VISUALS.md        D3 patterns, interaction, rendering decisions
  STILL.md          the structured project: directives, registry, editing
  commands/         Claude Code slash commands (thin wrappers)
  skills/           Codex skills (symlinks back to the canonical files)
  template/         the runnable still project (see below)
docs/               published example articles (GitHub Pages)
```

Skill behavior lives in the markdown files; runtime behavior lives in the
template. Most improvements touch both: implement in the template, then
document the convention in `STILL.md` so the agent uses it when building
articles.

## Extending the template

**A new figure** — drop a component in `src/figures/`, register it in
`src/figures/registry.ts`, reference it from markdown with
`:::figure{id=your-id}`. This is the same path articles use; see "How a
Figure Gets Added" in `STILL.md`.

**A new directive** — `src/lib/directive-handler.ts` maps remark-directive
nodes to `mn-*` tag names; `src/components/Article.tsx` maps those tags to
React components. Add the mapping in both places and a component to handle it.
Keep the author-facing grammar small: three directive flavors is a feature,
not a limitation.

**The edit pipeline** — in-place prose editing spans
`src/lib/EditContext.tsx` (state + splice), `src/components/EditableBlock.tsx`
/ `EditableField.tsx` / `SourceEditor.tsx` (UI), and
`vite-plugin-moonshine-edit.ts` (the dev-only save endpoint). The invariant to
preserve: edits are pure offset splices into the markdown body — never
serialize rendered output back to markdown.

**Styles** — shared palette and type stack live in `src/styles/tokens.css`;
figures reference the CSS custom properties (`var(--accent)`, `var(--text-2)`)
rather than hardcoding colors.

## Working on the skill documents

`SKILL.md` is the canonical editorial process. `STILL.md` is canonical for the
structured project. The command files in `commands/` and the Codex skills in
`skills/` are thin wrappers — when workflow details change, change the
canonical file, not the wrappers. If a doc claims behavior, the template must
actually behave that way; doc/code drift is treated as a bug.
