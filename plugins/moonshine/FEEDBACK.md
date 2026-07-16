# Authorship Feedback Protocol

A harness-agnostic protocol that lets the rendered article (the web app) send
comments back to whatever agent session authored it, and lets that session reply
— without the web app knowing anything about the agent runtime.

The contract is **a set of files in a directory**. The web app reads and writes
those files; a *harness adapter* (Claude Code, Codex, pi, …) reads and writes the
same files. Neither side calls the other directly. This file is the ABI: a new
adapter is "done" when it fulfils the four verbs in [Adapter contract](#adapter-contract).

> Status: design spec for the `feature/authorship-feedback` branch. No runtime
> code depends on a specific harness; Claude Code is the first adapter.

## At a glance

```
web app  ──write──▶  .feedback/<id>.json      ◀──claim/reply──  harness adapter
HUD      ──write──▶  .feedback/control.json    ──read──▶         (Stop hook / loop /
HUD      ──write──▶  .feedback/address.json    ──consume──▶      daemon / MCP / …)
HUD      ──read───▶  .feedback/heartbeat.json  ◀──write──
HUD      ──read───▶  .feedback/adapter.json    ◀──write──
```

Comments **accumulate by default**: adapters do not drain the inbox on their
own. Delivery happens when the author explicitly requests it — the HUD's
Address button writes `address.json`, which the next adapter pass consumes —
or when the author has opted the project into continuous auto-address
(`control.json` mode `listen`).

Everything the web side knows is in this directory. Everything an adapter must do
is defined against this directory. That is the entire coupling.

## Location

```
~/.agent/moonshine/<project>/.feedback/
```

Adapters that don't know the project (e.g. a Claude Code session launched from
`~/code`) MAY glob `~/.agent/moonshine/*/.feedback/` and drain every project; each
comment record is self-describing (carries its own `project` and `path`).

## Files

### `<id>.json` — one comment (the inbox)

One file per comment. `<id>` is opaque and unique (e.g. `fb_<ts>_<rand>`).

```jsonc
{
  "id": "fb_20260616_a1b2",
  "ts": "2026-06-16T18:30:00Z",      // ISO 8601, UTC
  "project": "dim-reduction",         // ~/.agent/moonshine/<project>
  "status": "pending",                // see lifecycle below
  "target": {
    "kind": "block",                  // block | figure (caption | term | selection reserved)
    "path": "series/02-momentum.md",  // path relative to <project>/content/ (no "content/" prefix)
    "range": [1204, 1487],            // [start,end) source offsets, for prose/captions
    "figureId": "loss-landscape",     // for kind=figure
    "termRef": "loss-landscape.update", // for kind=term (dotted figure.part)
    "excerpt": "the exact source text being commented on",
    "anchorHash": "a3f9c0"            // fnv1a(body) when the comment was made
  },
  "comment": "this paragraph is too hand-wavy — show the actual update rule",
  "reply": null,                      // adapter writes a one-line summary here
  "deliveredAt": null,
  "addressedAt": null
}
```

`target.kind` determines which fields are meaningful:

| kind | required target fields | meaning | status |
|---|---|---|---|
| `block` | `path`, `range`, `excerpt` | a prose block (paragraph, heading, list, …) | **wired** |
| `figure` | `path`, `figureId` | a whole figure / its parameters | **wired** |
| `caption` | `path`, `range`, `excerpt` | a figure caption (inner content of a directive) | reserved |
| `term` | `path`, `termRef` | an inline `:term[…]{to=…}` reference | reserved |
| `selection` | `path`, `range`, `excerpt` | an arbitrary text selection | reserved |

**Wired vs reserved.** The UI currently emits only `block` and `figure` (the 💬
affordance on a prose block's source editor and on a figure's knob panel). The
`caption`, `term`, and `selection` kinds are part of the ABI — the endpoint
validates and accepts them, and adapters read `target` generically — but no
affordance produces them yet. They are reserved so a later UI (or a different
harness) can use them without a protocol bump.

The web app fills `target` from data it already has at render time: react-markdown
hast `node.position.*.offset` (→ `range`), the Velite `path`, the figure registry
`figureId`, and `fnv1a(body)` (→ `anchorHash`, reusing the save endpoint's hash).

#### Status lifecycle

```
pending ──claim──▶ delivered ──reply──▶ addressed
   │                   │
   └───────────────────┴──▶ dismissed   (author closed it from the HUD)
```

- `pending` — written by the web app; not yet picked up.
- `delivered` — an adapter has claimed it (see atomicity) and handed it to the session.
- `addressed` — the session acted; `reply` + `addressedAt` are set.
- `dismissed` — the author dismissed it from the HUD; adapters MUST skip it.

#### Atomicity / claiming

Multiple pickup paths may race one inbox (e.g. two Claude Code sessions, or a
Stop hook and the idle loop). To avoid double-processing, **claim by renaming the
record itself** to a private name — `rename(<id>.json, <id>.json.claiming.<pid>)`
— *before* touching its contents. `rename()` is atomic, so if two drainers race,
exactly one finds the source and wins; the loser's rename fails (source already
gone) and it skips the comment. Only after winning does the owner rewrite the
claimed file to `delivered` and rename it back to `<id>.json`.

> Note: renaming the *new* version **over** the original is NOT a claim — an
> overwrite succeeds for every racer, so both would "win" and inject the comment
> twice. The source rename is the mutual-exclusion primitive; the content
> rewrite is a separate step. A drainer that dies mid-claim leaves a
> `*.claiming.*` file; adapters SHOULD restore such orphans (whose owner process
> is gone) back to `<id>.json` on a later pass so nothing is stranded.

All content mutations still use temp-file + `rename` (never partial writes),
mirroring the existing `/__moonshine/save` endpoint.

**Re-delivery of stranded comments.** Claiming marks a record `delivered` *before*
the session has addressed it, so a turn that is interrupted or ignored can leave a
comment stuck in `delivered` forever — nothing re-surfaces it, since claim only
matches `pending`. Adapters SHOULD therefore also re-claim `delivered` records
whose `deliveredAt` is older than a staleness window (the claude-code adapter uses
300s) and re-deliver them, resetting `deliveredAt`. This bounds a lost comment to
one staleness window instead of losing it outright.

### `control.json` — author's listen-mode request (HUD → adapter)

```jsonc
{
  "mode": "accumulate",
  "updatedAt": "2026-06-16T18:29:00Z",
  "sessionId": "8b1f6a2e-4c3d-4e5f-9a0b-1c2d3e4f5a6b"
}
// mode: "accumulate" | "listen" | "paused" | "stopped"
```

Written by the HUD's mode controls. Adapters read it on every pass (listener
tick or turn-boundary pickup):

- `accumulate` — **the default** (absent file ≡ `accumulate`). Do not drain on
  your own; comments pile up until the author requests delivery via
  `address.json` (below).
- `listen` — continuous auto-address: drain pending comments, act, reply.
- `paused` — stay alive (heartbeat) but don't drain automatically.
- `stopped` — write a final heartbeat with `mode:"stopped"` and end the listener
  (do not reschedule). A later explicit Address request can still be handled by
  a turn-boundary adapter.

A turn-boundary pickup (e.g. a Stop hook) MUST honor this too: paused/stopped
projects do not drain automatically, and an absent file is `accumulate` — never
license to drain. A one-shot `address.json` is an explicit override: drain once
without changing the underlying mode. (This is a behavior change from the first
protocol revision, where an absent file meant `listen`; silent pickup by whatever
session ended a turn first proved surprising in practice.)

`sessionId` routes auto-address to the article's authoring session. The web side
copies it from `moonshine.meta.json` or the dev server's Claude environment;
adapters MUST leave a request for a different named session untouched. It is
optional only for compatibility with records written before session routing.

### `address.json` — one-shot delivery request (HUD → adapter)

```jsonc
{
  "requestedAt": "2026-07-14T18:31:00Z",
  "sessionId": "8b1f6a2e-4c3d-4e5f-9a0b-1c2d3e4f5a6b"
}
```

Written by the HUD's **Address** button. Its presence asks the next adapter
pass to drain the inbox even in `accumulate` mode. The adapter that performs
the drain **deletes the file** (the request is consumed) — its absence is how
the HUD knows the request was picked up. Because pressing Address is explicit,
it drains once even while paused/stopped, without enabling continuous pickup.
Under `listen` it is redundant, but adapters SHOULD still consume it.
`sessionId` prevents another active session's turn-boundary hook from claiming
the request first; a non-matching adapter MUST neither drain nor delete it.

### `heartbeat.json` — adapter liveness (adapter → HUD)

```jsonc
{
  "harness": "claude-code",
  "mode": "listen",                  // echoes the control mode it's honoring
  "ts": "2026-06-16T18:30:05Z",      // updated every tick
  "intervalSec": 90,                 // nominal tick cadence (for staleness calc)
  "pending": 0,                      // count of pending comments at last tick
  "lastDrainedAt": "2026-06-16T18:25:00Z"
}
```

The HUD derives status purely from this file:

- fresh (`now - ts < 2 * intervalSec`) + `mode:listen` → **listening**
- fresh + `mode:paused` → **paused**
- stale or missing → **off**

Only a *running listener* writes a heartbeat. A turn-boundary pickup (e.g. a Stop
hook) need not heartbeat; it just claims + replies. So "off" means "no active
listener," which is honest even when an adapter is installed.

### `adapter.json` — installed-adapter manifest (adapter → HUD)

Written once when an adapter is installed/available, independent of whether a
listener is currently running. Lets the HUD distinguish "claude-code installed but
off" from "no agent connected at all."

```jsonc
{ "harness": "claude-code", "version": "adapter", "installedAt": "2026-06-15T01:29:00Z" }
```

`version` is a free-form, harness-defined string (the claude-code adapter writes
the literal `"adapter"`); the HUD does not parse it.

## Adapter contract

A harness adapter is **anything that implements these four verbs** against the
files above. How it does so (hook, polling loop, daemon, MCP, IPC) is the
adapter's business and invisible to core.

1. **claim** — *only when the author asked* (`control.json` mode `listen`, or
   an `address.json` present as a one-shot override of any mode): first honor
   the request's optional `sessionId`, then find
   `status:"pending"` records (skip `dismissed`), atomic-rename each to
   `delivered` (set `deliveredAt`), and surface its `comment` + `target` to
   the agent session. Consume `address.json` after the drain pass.
2. **reply** — after the session acts, set `status:"addressed"`, `addressedAt`,
   and a one-line `reply` on the record.
3. **heartbeat** — while a listener is active, write `heartbeat.json` each tick and
   honor `control.json` (`listen`/`paused`/`stopped`).
4. **manifest** — declare presence via `adapter.json` on install.

An adapter that implements only **claim + reply** (no listener) still works for the
common case — feedback that lands while the session is actively working. The
listener (heartbeat + control) only adds idle-time coverage and the HUD's live
status; it is optional but recommended.

## Web-side dev endpoints

Registered by `vite-plugin-moonshine-feedback.ts`, **dev-only** (`apply: 'serve'`)
and **gated** on `moonshine.config.json → feedback.enabled`. Same content-type +
`sec-fetch-site` guard and atomic-write helpers as `/__moonshine/save`.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/__moonshine/feedback` | append a comment (`<id>.json`, `status:pending`) |
| `POST` | `/__moonshine/feedback/control` | write `control.json` (accumulate/listen/paused/stopped) |
| `POST` | `/__moonshine/feedback/dismiss` | set a comment `status:dismissed` |
| `POST` | `/__moonshine/feedback/address` | write `address.json` (request delivery of accumulated comments) |
| `GET`  | `/__moonshine/feedback` | list comments (id, ts, status, target, comment, reply) |
| `GET`  | `/__moonshine/feedback/capabilities` | `{ enabled, harness, alive, mode, control, addressRequestedAt, project }` derived from `adapter.json` + `heartbeat.json` + `control.json` + `address.json` |

`alive` is true when a non-stopped listener heartbeat is fresh (`now - ts < 2 * intervalSec`),
and `mode` (`listen`/`paused`) is its echoed control mode when alive, else null.
`control` is the author's requested mode (`accumulate` when `control.json` is
absent) and `addressRequestedAt` is the pending address request's timestamp, or
null once an adapter has consumed it.

`capabilities` is the single call the HUD makes on mount + on poll; it folds the
flag, the manifest, and the heartbeat into the state machine in
[Degradation](#graceful-degradation).

## Feature flag

Two independent gates:

1. **Kill switch** — `moonshine.config.json`:
   ```json
   { "feedback": { "enabled": true } }
   ```
   Override with env `MOONSHINE_FEEDBACK=off`. When disabled: the Vite plugin
   skips registering feedback routes, and the HUD and 💬 comment affordance
   suppress themselves at runtime (the `/capabilities` probe fails, so
   `caps.enabled` stays false). Combined with `import.meta.env.DEV`, the subsystem is
   absent from production builds and one-line-disableable in dev. No code removal.
   The claude-code Stop-hook adapter independently honors `MOONSHINE_FEEDBACK=off`
   as well, so a session doing unrelated work can silence the turn-boundary pickup
   from its own shell without touching any project's web config.
2. **Capability detection** — `GET …/capabilities` drives runtime degradation.

## Graceful degradation

| Situation | `capabilities` | HUD | comment box |
|---|---|---|---|
| flag off | (routes 404) | not mounted | absent |
| flag on, no `adapter.json` | `harness:null` | "⚪ no agent connected" | **writable** |
| adapter present, no live listener | `harness:"x", alive:false` | "◯ agent · ready" + Address | writable |
| address requested, not yet consumed | `addressRequestedAt` set | "🟡 agent · address queued" + example prompt | writable |
| adapter + fresh heartbeat | `alive:true, mode` | "🟢 listening" / "⏸ paused" | writable |

Because comments are plain files, they are **never lost on an unsupported or
offline harness** — they persist as `pending` until some listener drains them. A
Codex user can author and comment today; the next listening session picks them up.

## Cold-start caveat (per-harness)

No supported mechanism pushes into a *fully idle* interactive session (one parked
at the prompt). So a listener can be paused/resumed/stopped from the HUD live (the
loop is ticking and reads `control.json`), but a request into an idle session
waits for its next activity:

- The HUD "Address" writes `address.json`, which the Stop hook consumes at the
  authoring session's **next turn boundary** — so the request is reliable and
  cannot be stolen by another active session, but an idle
  session needs a nudge. The HUD therefore pairs the queued state with a
  copyable example prompt (e.g. `address my moonshine comments on <project>`):
  sending it both wakes the session and tells it exactly what to do.
- Auto-address ("listen") is honored opportunistically when the session is next
  active (the Claude Code adapter's Stop hook notices `listen` + stale heartbeat
  and nudges the session to start its listener).
- A guaranteed cold start of the idle listener uses a harness command (Claude
  Code: `/moonshine:moonshine-listen` — plugin skills are namespaced, so the
  bare `/moonshine-listen` does not resolve).

The HUD states this plainly rather than offering a button that silently no-ops.

## Adapters

The **claude-code** adapter (the first one) is split across three files:

- `hooks/hooks.json` — registers the Stop hook at the plugin's standard hooks
  location (auto-merged on install). Points at the script below via
  `${CLAUDE_PLUGIN_ROOT}`.
- `adapters/claude-code/hooks/moonshine-stop.sh` — the Stop hook itself:
  fulfils `manifest` (writes `adapter.json`) and `claim` (atomic pending →
  delivered + inject the comments so Claude addresses them) — but only when
  the author asked: an `address.json` request (consumed after the drain) or
  auto-address mode (`listen`). Requests are routed by `sessionId`, and an
  explicit Address drains once even if automatic pickup is paused/stopped.
  Accumulate-mode projects are otherwise left untouched.
  It also nudges the listener when the author enabled auto-address with no
  live heartbeat, skips automatic pickup for projects the author
  `paused`/`stopped`, re-delivers
  comments stranded in `delivered` past the 300s staleness window, and no-ops
  entirely under `MOONSHINE_FEEDBACK=off`.
- `skills/moonshine-listen/SKILL.md` — the `heartbeat`+`control` loop for idle
  coverage. Lives in `skills/` (not under `adapters/`) so it is discoverable as
  `/moonshine:moonshine-listen`; run it under `/loop` to keep ticking.

A future `adapters/<harness>/` implements the same four verbs however that
harness allows, and touches nothing in core.
