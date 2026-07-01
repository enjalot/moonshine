---
name: moonshine-listen
description: Listen for moonshine authorship feedback and address comments on an interval. Invoke when the author asks you to watch for feedback from the article HUD, or when prompted to start the listener. Best run under /loop (e.g. `/loop $moonshine-listen`) so it keeps ticking while the session is idle.
---

# moonshine-listen — authorship feedback listener (Claude Code adapter)

This is the **idle-coverage half** of the moonshine authorship-feedback loop
(`plugins/moonshine/FEEDBACK.md`). The Stop hook already picks up comments that
arrive while you are actively working; this skill handles comments left while
the session is idle, and powers the HUD's live status (the heartbeat) and its
start/pause/stop controls (the `control.json` it reads).

Each invocation performs **one tick**. Run it under `/loop` so the ticks repeat.

## Scope

- If invoked with a project name argument, operate on
  `~/.agent/moonshine/<arg>/.feedback/` only.
- Otherwise operate on every existing `~/.agent/moonshine/*/.feedback/` inbox.

Use absolute, ISO-8601 UTC timestamps (`date -u +%Y-%m-%dT%H:%M:%SZ`) everywhere.

## One tick

For each in-scope `.feedback/` directory:

1. **Manifest.** If `adapter.json` is missing, write
   `{"harness":"claude-code","version":"adapter","installedAt":"<now>"}`.

2. **Read control.** Read `control.json`; treat a missing file as
   `{"mode":"listen"}`.
   - If `mode == "stopped"`: write a final `heartbeat.json` with
     `"mode":"stopped"` and the current `ts`, then **end** — do not schedule
     another tick for this project. (If all in-scope projects are stopped, end
     the loop entirely; tell the user the listener stopped.)

3. **Heartbeat.** Write `heartbeat.json`:
   ```json
   {"harness":"claude-code","mode":"<mode>","ts":"<now>","intervalSec":90,"pending":<n>}
   ```
   where `<n>` is the number of `status:"pending"` comment files.

4. **Drain (only when `mode == "listen"`).** For each comment file (any
   `*.json` other than `control.json` / `heartbeat.json` / `adapter.json`) that
   is either `status == "pending"` **or** `status == "delivered"` with a
   `deliveredAt` more than 300s ago (a comment claimed by an earlier
   turn/tick that was never addressed — re-surface it rather than strand it):
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
   - When `mode == "paused"`: skip draining (heartbeat only).

## Continue the loop

After the tick, unless every in-scope project was `stopped`:
- When running under `/loop` (dynamic): call **ScheduleWakeup** with
  `delaySeconds: 90` and the same prompt (`$moonshine-listen`) so the next tick
  fires. Keep `intervalSec` in the heartbeat aligned with this delay. If the
  harness has no ScheduleWakeup tool, fall back to telling the author to
  re-invoke the skill (or run it under `/loop`).
- If you are not in a loop, tell the author to run
  `/loop /moonshine:moonshine-listen` for continuous listening; a bare
  invocation only does a single tick. (Plugin skills are namespaced — the bare
  `/moonshine-listen` does not resolve.)

## Notes

- The Stop hook and this loop both claim by atomic rename, so they never
  double-process a comment even if they run close together.
- Keep replies short and factual — they surface back in the author's HUD next
  to their original comment.
