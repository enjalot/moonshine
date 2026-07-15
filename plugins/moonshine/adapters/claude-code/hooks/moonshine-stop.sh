#!/usr/bin/env bash
# Claude Code adapter for the moonshine authorship-feedback protocol
# (see plugins/moonshine/FEEDBACK.md). Runs as a Stop hook: at every turn
# boundary it scans each project's .feedback/ inbox and — when the author has
# asked for delivery — claims pending comments (atomic pending -> delivered)
# and injects them so Claude addresses the feedback before the turn truly
# ends. Delivery is requested either by an address.json (the HUD's Address
# button; consumed after the drain) or by the explicit auto-address mode
# (control.json mode "listen"). Requests carrying a sessionId are handled
# only by that Claude session, so an unrelated session cannot steal them.
# The default mode, "accumulate" (absent
# control.json), never drains: comments pile up silently until the author
# asks. This is the "claim" verb at turn granularity plus an instruction to
# "reply"; the moonshine-listen skill adds the idle-time heartbeat/control
# loop.
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
hook_session=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || echo "")

now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
now_epoch=$(date +%s)
root="$HOME/.agent/moonshine"
# A comment claimed but never addressed stays "delivered" forever unless we
# re-surface it: after this many seconds a delivered-but-unaddressed record is
# eligible for re-delivery (an interrupted or ignored turn shouldn't strand it).
STALE_DELIVERED_SEC=300
shopt -s nullglob

# Portable ISO-8601 UTC ("…Z") → epoch seconds. GNU date parses with -d; BSD /
# macOS date needs -j -f (Claude Code sessions commonly run on macOS, where -d
# is unsupported and would otherwise silently fail). Echoes 0 when neither
# parses; callers treat 0 as "unknown" and skip the time-based branch.
iso_to_epoch() {
  local ts="$1" e
  e=$(date -u -d "$ts" +%s 2>/dev/null) && { printf '%s' "$e"; return; }
  e=$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$ts" +%s 2>/dev/null) && { printf '%s' "$e"; return; }
  printf '0'
}

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

  # Read the author's listen-mode control once. Absent ≡ accumulate: the
  # default is to let comments pile up, NOT to drain them — an author adding
  # comments should never have them silently picked up by whatever session
  # happens to end a turn first. paused/stopped are honored here too, so a
  # silenced project does not drain automatically. A one-shot Address request
  # is an explicit override and is handled below even while paused/stopped.
  mode="accumulate"
  control_session=""
  if [ -f "$fb/control.json" ]; then
    m=$(jq -r '.mode // empty' "$fb/control.json" 2>/dev/null || echo "")
    [ -n "$m" ] && mode="$m"
    control_session=$(jq -r '.sessionId // empty' "$fb/control.json" 2>/dev/null || echo "")
  fi

  # Drain only when the author asked: either continuous auto-address
  # (mode listen) or a one-shot address request (address.json, written by the
  # HUD's Address button and consumed below once the drain completes).
  address_requested=no
  address_session=""
  if [ -f "$fb/address.json" ]; then
    address_requested=yes
    address_session=$(jq -r '.sessionId // empty' "$fb/address.json" 2>/dev/null || echo "")
  fi

  # Vite stamps new requests with the authoring session. Only that session's
  # Stop hook may claim them; legacy unstamped files remain compatible.
  requested_session=""
  if [ "$address_requested" = "yes" ]; then
    requested_session="$address_session"
  elif [ "$mode" = "listen" ]; then
    requested_session="$control_session"
  fi
  if [ -n "$requested_session" ] && [ "$hook_session" != "$requested_session" ]; then
    continue
  fi

  # Pause/stop suppress automatic pickup, but the Address button is a
  # deliberate one-shot override. With no request, keep honoring the silence.
  if [ "$address_requested" = "no" ]; then
    case "$mode" in paused|stopped) continue ;; esac
  fi
  if [ "$mode" != "listen" ] && [ "$address_requested" = "no" ]; then
    continue
  fi

  # Recover any record orphaned by a crash mid-claim — a "<f>.claiming.<pid>"
  # left behind if a drainer died between taking a record and writing it back.
  # Only reclaim true orphans: if the owning process is still alive it is
  # mid-claim right now, so leave it alone (avoids stealing a live claim).
  for orphan in "$fb"/*.json.claiming.*; do
    [ -e "$orphan" ] || continue
    opid="${orphan##*.claiming.}"
    case "$opid" in ''|*[!0-9]*) : ;; *) kill -0 "$opid" 2>/dev/null && continue ;; esac
    base="${orphan%.claiming.*}"
    if [ -e "$base" ]; then rm -f "$orphan"; else mv "$orphan" "$base" 2>/dev/null || true; fi
  done

  # Claim comments to deliver: every pending one, plus any stuck in "delivered"
  # past the staleness window (claimed by an earlier turn that never addressed
  # them). Without the second case an interrupted turn would strand a comment
  # forever, since nothing else re-surfaces a delivered record.
  for f in "$fb"/*.json; do
    case "$(basename "$f")" in
      control.json|heartbeat.json|adapter.json|address.json) continue ;;
    esac
    status=$(jq -r '.status // empty' "$f" 2>/dev/null)
    claim=no
    if [ "$status" = "pending" ]; then
      claim=yes
    elif [ "$status" = "delivered" ]; then
      da=$(jq -r '.deliveredAt // empty' "$f" 2>/dev/null)
      if [ -n "$da" ]; then
        da_epoch=$(iso_to_epoch "$da")
        [ "$da_epoch" -gt 0 ] && [ "$((now_epoch - da_epoch))" -ge "$STALE_DELIVERED_SEC" ] && claim=yes
      fi
    fi
    [ "$claim" = yes ] || continue

    # Take exclusive ownership by renaming the record itself to a private name.
    # rename() is atomic, so if another drainer (a second session, or the idle
    # listener) is racing us, exactly one mv finds the source and wins; the
    # loser's mv fails (source already gone) and it skips the comment. A plain
    # rewrite-in-place lets both "win" and inject the same comment twice.
    claimed="$f.claiming.$$"
    mv "$f" "$claimed" 2>/dev/null || continue

    # Rewrite the claimed record to delivered, then restore the canonical name.
    tmp="$claimed.tmp"
    if jq --arg now "$now" '.status="delivered" | .deliveredAt=$now' "$claimed" > "$tmp" 2>/dev/null; then
      mv "$tmp" "$f"
      rm -f "$claimed"
    else
      rm -f "$tmp"
      mv "$claimed" "$f" 2>/dev/null || true   # rewrite failed: put it back untouched
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

  # The address request is fulfilled by this drain pass (any records another
  # drainer raced us to are being handled there) — consume it so the HUD
  # stops showing "address queued".
  [ "$address_requested" = "yes" ] && rm -f "$fb/address.json"

  # Note projects where the author *explicitly* asked for auto-address
  # (control.json present, mode listen) but no live heartbeat exists — an
  # opportunistic cue to start the idle listener. Accumulate-mode projects
  # get no nudge: the Address flow covers them without a listener.
  [ "$mode" = "listen" ] || continue
  [ -f "$fb/control.json" ] || continue
  fresh=no
  if [ -f "$fb/heartbeat.json" ]; then
    hb_ts=$(jq -r '.ts // empty' "$fb/heartbeat.json" 2>/dev/null)
    iv=$(jq -r '.intervalSec // 90' "$fb/heartbeat.json" 2>/dev/null)
    if [ -n "$hb_ts" ]; then
      hb_epoch=$(iso_to_epoch "$hb_ts")
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
The author enabled feedback-listening for project(s):$listen_waiting but no listener is running. After handling any comments above, start the idle listener by invoking the moonshine:moonshine-listen skill."
fi

jq -n --arg r "$msg" '{decision:"block", reason:$r}'
exit 0
