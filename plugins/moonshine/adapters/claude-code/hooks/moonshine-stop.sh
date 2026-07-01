#!/usr/bin/env bash
# Claude Code adapter for the moonshine authorship-feedback protocol
# (see plugins/moonshine/FEEDBACK.md). Runs as a Stop hook: at every turn
# boundary it scans each project's .feedback/ inbox, claims pending comments
# (atomic pending -> delivered), and injects them so Claude addresses the
# feedback before the turn truly ends. This is the "claim" verb at turn
# granularity plus an instruction to "reply"; the moonshine-listen skill adds
# the idle-time heartbeat/control loop.
#
# Designed to never break a session: any unexpected condition exits 0 (allow
# the stop) rather than erroring.

# Read hook input from stdin.
input=$(cat 2>/dev/null || true)

# Global opt-out: any session/shell can silence the adapter entirely by
# exporting MOONSHINE_FEEDBACK=off (mirrors the web-side kill switch), so a
# session doing unrelated work never gets its stop blocked by moonshine
# feedback.
case "${MOONSHINE_FEEDBACK:-}" in
  0|off|OFF|false|FALSE|no|NO) exit 0 ;;
esac

# jq is required to parse/rewrite the JSON records; without it, no-op.
command -v jq >/dev/null 2>&1 || exit 0

# Don't fight the consecutive-block loop cap: if we already blocked this turn,
# let Claude stop.
stop_active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
[ "$stop_active" = "true" ] && exit 0

now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
now_epoch=$(date +%s)
root="$HOME/.agent/moonshine"
# A comment claimed but never addressed stays "delivered" forever unless we
# re-surface it: after this many seconds a delivered-but-unaddressed record is
# eligible for re-delivery (an interrupted or ignored turn shouldn't strand it).
STALE_DELIVERED_SEC=300
shopt -s nullglob

reason=""
count=0
listen_waiting=""

for fb in "$root"/*/.feedback; do
  [ -d "$fb" ] || continue
  proj_dir=$(dirname "$fb")
  proj=$(basename "$proj_dir")

  # Declare this harness installed (idempotent) so the HUD can distinguish
  # "claude-code present but off" from "no agent connected". Written even when
  # the project is paused/stopped, so the HUD still shows the adapter present.
  [ -f "$fb/adapter.json" ] || \
    printf '{"harness":"claude-code","version":"adapter","installedAt":"%s"}\n' "$now" \
      > "$fb/adapter.json" 2>/dev/null || true

  # Read the author's listen-mode control once. Absent ≡ listen (default-on).
  # If the author paused or stopped this project from the HUD, honor it here
  # too: the turn-boundary pickup stays silent, so a stopped project never
  # hijacks an unrelated session's stop. Only listen (or an absent control)
  # drains — mirroring the listener's own semantics.
  mode="listen"
  if [ -f "$fb/control.json" ]; then
    m=$(jq -r '.mode // empty' "$fb/control.json" 2>/dev/null || echo "")
    [ -n "$m" ] && mode="$m"
  fi
  [ "$mode" = "listen" ] || continue

  # Claim comments to deliver: every pending one, plus any stuck in "delivered"
  # past the staleness window (claimed by an earlier turn that never addressed
  # them). Without the second case an interrupted turn would strand a comment
  # forever, since nothing else re-surfaces a delivered record.
  for f in "$fb"/*.json; do
    case "$(basename "$f")" in
      control.json|heartbeat.json|adapter.json) continue ;;
    esac
    status=$(jq -r '.status // empty' "$f" 2>/dev/null)
    claim=no
    if [ "$status" = "pending" ]; then
      claim=yes
    elif [ "$status" = "delivered" ]; then
      da=$(jq -r '.deliveredAt // empty' "$f" 2>/dev/null)
      if [ -n "$da" ]; then
        da_epoch=$(date -d "$da" +%s 2>/dev/null || echo 0)
        [ "$da_epoch" -gt 0 ] && [ "$((now_epoch - da_epoch))" -ge "$STALE_DELIVERED_SEC" ] && claim=yes
      fi
    fi
    [ "$claim" = yes ] || continue

    tmp="$f.moonshine-tmp"
    if jq --arg now "$now" '.status="delivered" | .deliveredAt=$now' "$f" > "$tmp" 2>/dev/null; then
      mv "$tmp" "$f"
    else
      rm -f "$tmp"
      continue
    fi

    kind=$(jq -r '.target.kind // "?"' "$f")
    tpath=$(jq -r '.target.path // "?"' "$f")
    figure=$(jq -r '.target.figureId // empty' "$f")
    excerpt=$(jq -r '.target.excerpt // empty' "$f")
    comment=$(jq -r '.comment // empty' "$f")

    count=$((count + 1))
    reason+="
[$count] project \"$proj\"
  edit:    $proj_dir/content/$tpath
  target:  $kind${figure:+ (figure: $figure)}"
    [ -n "$excerpt" ] && reason+="
  excerpt: $excerpt"
    reason+="
  COMMENT: $comment
  when done, update $f → .status=\"addressed\", .addressedAt, .reply=<one line>
"
  done

  # Note projects where the author *explicitly* asked to listen (control.json
  # present, mode listen) but no live heartbeat exists — an opportunistic cue
  # to start the idle listener. An absent control.json is NOT a request to
  # listen: the Stop hook already delivered any comments, so we only nudge when
  # the author pressed Start in the HUD.
  [ -f "$fb/control.json" ] || continue
  fresh=no
  if [ -f "$fb/heartbeat.json" ]; then
    hb_ts=$(jq -r '.ts // empty' "$fb/heartbeat.json" 2>/dev/null)
    iv=$(jq -r '.intervalSec // 90' "$fb/heartbeat.json" 2>/dev/null)
    if [ -n "$hb_ts" ]; then
      hb_epoch=$(date -d "$hb_ts" +%s 2>/dev/null || echo 0)
      [ "$hb_epoch" -gt 0 ] && [ "$((now_epoch - hb_epoch))" -lt "$((iv * 2))" ] && fresh=yes
    fi
  fi
  [ "$fresh" = no ] && listen_waiting="$listen_waiting $proj"
done

# Nothing to deliver and nobody waiting to listen → allow the stop.
if [ "$count" -eq 0 ] && [ -z "$listen_waiting" ]; then
  exit 0
fi

msg=""
if [ "$count" -gt 0 ]; then
  msg="The article author sent $count feedback comment(s) from the moonshine authorship HUD. Address each by editing the referenced source file, then record the outcome in its comment file (.status=\"addressed\", an ISO-8601 .addressedAt, and a one-line .reply). Comments:
$reason"
fi
if [ -n "$listen_waiting" ]; then
  msg="$msg
The author enabled feedback-listening for project(s):$listen_waiting but no listener is running. After handling any comments above, start the idle listener by invoking the /moonshine-listen skill."
fi

jq -n --arg r "$msg" '{decision:"block", reason:$r}'
exit 0
