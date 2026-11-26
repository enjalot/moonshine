---
name: moonshine-listen
description: Listen for moonshine authorship feedback and address comments on an interval. Use when the author asks you to watch for feedback from the article HUD, or when prompted to start the idle feedback listener (works with Claude Code `/loop` and Antigravity `schedule` / `/schedule`).
---

# moonshine-listen — authorship feedback listener

This is the **idle-coverage half** of the moonshine authorship-feedback loop
(`../moonshine/FEEDBACK.md`). Each harness's Stop hook handles delivery at turn
boundaries; this skill covers requests that land while the session is idle, and
powers the HUD's live status (the heartbeat) and its mode controls (the
`control.json` it reads). Note the default mode is **accumulate**: comments pile
up and are only drained when the author presses Address in the HUD
(`address.json`) or has opted into continuous auto-address (`listen`).

Each invocation performs **one tick**, then reschedules itself using your
harness's timer mechanism (`schedule` in Antigravity, `ScheduleWakeup` / `/loop`
in Claude Code).

## Detect your harness and session ID

Determine which harness you are running in:

- **Antigravity**: `harness` is `"antigravity"`. Your session ID is your
  Conversation ID (from `<user_information>`).
- **Claude Code**: `harness` is `"claude-code"`. Your session ID is
  `$CLAUDE_CODE_SESSION_ID`.
- **Other harnesses**: use a short lowercase harness name (e.g., `"codex"`) and
  leave session ID unset if unavailable.

## Scope

- If invoked with a project name argument, operate on
  `~/.agent/moonshine/<arg>/.feedback/` only.
- Otherwise operate on every existing `~/.agent/moonshine/*/.feedback/` inbox.
- If `MOONSHINE_FEEDBACK=off` is set in the environment, do nothing and end
  the loop — the same kill switch the Stop hooks and the dev server honor.

Use absolute, ISO-8601 UTC timestamps (`date -u +%Y-%m-%dT%H:%M:%SZ`) everywhere.

## One tick

For each in-scope `.feedback/` directory:

1. **Manifest.** If `adapter.json` is missing, write
   `{"harness":"<harness>","version":"adapter","installedAt":"<now>"}`.

2. **Read control.** Read `control.json`; treat a missing file as
   `{"mode":"accumulate"}` (the default: hold comments, don't drain).
   - If `mode == "stopped"` and there is no `address.json`: write a final `heartbeat.json` with
     `"mode":"stopped"` and the current `ts`, then **end** — do not schedule
     another tick for this project. (If all in-scope projects are stopped, end
     the loop entirely; tell the user the listener stopped.)

3. **Route to the authoring session.** Read the optional `sessionId` from
   `address.json` (for a one-shot request), or from `control.json` when mode is
   `listen`. Compare it with your session/conversation ID. If the request names
   a different session — or names one but your session ID is unavailable — skip
   this project entirely and do not consume its request. Legacy files without a
   `sessionId` remain unscoped.

4. **Heartbeat.** Write `heartbeat.json`:
   ```json
   {"harness":"<harness>","mode":"<mode>","ts":"<now>","intervalSec":90,"pending":<n>}
   ```
   where `<n>` is the number of `status:"pending"` comment files.

5. **Drain (only when the author asked).** Drain when `mode == "listen"`
   (continuous auto-address), **or** whenever `address.json` exists (the HUD's
   explicit one-shot Address request). Address is a deliberate override of
   pause/stop: drain once while leaving the underlying control mode unchanged.
   After a drain pass triggered by `address.json`, delete `address.json` — the
   request is consumed. When `mode == "accumulate"` and there is no
   `address.json`, skip draining entirely: comments accumulate by design.
   For each comment file (any `*.json` other than `control.json` /
   `heartbeat.json` / `adapter.json` / `address.json`) that is either
   `status == "pending"` **or** `status == "delivered"` with a `deliveredAt`
   more than 300s ago (a comment claimed by an earlier turn/tick that was never
   addressed — re-surface it rather than strand it):
   - Claim it exclusively by first renaming the record itself to a private name
     (`mv <id>.json <id>.json.claiming.$$`). That rename is the mutual-exclusion
     point — if another drainer already took it, your `mv` fails and you skip
     the comment. Renaming a rewritten copy *over* the original is NOT a claim
     (both racers would win). Then rewrite the claimed file with
     `status:"delivered"` and `deliveredAt:"<now>"` and rename it back to
     `<id>.json`.
   - Read `target` (`path`, `kind`, `figureId`, `range`, `excerpt`, `anchorHash`)
     and `comment`. The source file is `<project>/content/<target.path>`.
   - If `anchorHash` no longer matches the current file body, the prose moved —
     locate the passage by `excerpt` instead of trusting `range`.
   - **Address the comment** by editing the source file (or the figure
     component / registry it points at).
   - Record the outcome: set `status:"addressed"`, `addressedAt:"<now>"`, and a
     one-line `reply` summarizing what you changed. Write atomically.
   - When `mode == "paused"` or `"stopped"` and there is no address request,
     skip draining. If stopped with an address request, drain once, write the
     final stopped heartbeat, and then end this project's loop.

## Continue the loop

After the tick, unless every in-scope project was `stopped`:

- **Antigravity:** Call the `schedule` tool with `DurationSeconds: 90` and a
  `Prompt` to run another `moonshine-listen` tick (include the project name if
  scoped), then end your turn so the timer wakes you cleanly. Keep `intervalSec`
  in `heartbeat.json` aligned with `DurationSeconds`. The user can also launch
  continuous listening with `/schedule`.
- **Claude Code:** When running under `/loop` (dynamic), call `ScheduleWakeup`
  with `delaySeconds: 90` and the same prompt (`$moonshine-listen`) so the next
  tick fires. If you are not in a loop, tell the author to run
  `/loop /moonshine:moonshine-listen` for continuous listening (plugin skills
  are namespaced, so bare `/moonshine-listen` does not resolve).
- **Other harnesses without a timer tool:** Tell the author to re-invoke the
  skill when ready for the next tick.

## Notes

- The Stop hook and this loop both claim by atomic rename, so they never
  double-process a comment even if they run close together.
- Both paths honor a request's `sessionId`, so another session cannot steal
  feedback intended for the article's authoring session.
- Keep replies short and factual — they surface back in the author's HUD next
  to their original comment.
