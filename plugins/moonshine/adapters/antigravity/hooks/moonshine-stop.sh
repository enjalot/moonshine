#!/usr/bin/env bash
# Antigravity adapter for the moonshine authorship-feedback protocol
# (see plugins/moonshine/FEEDBACK.md). Runs as an Antigravity Stop hook: at
# normal turn completion (terminationReason == "NO_TOOL_CALL") it scans each
# project's .feedback/ inbox and — when the author has asked for delivery —
# claims pending comments (atomic pending -> delivered) and returns
# {"decision":"continue","reason":...} so Antigravity addresses the feedback
# before the turn truly ends.
#
# Delivery is requested either by an address.json (the HUD's Address button;
# consumed after the drain) or by explicit auto-address mode (control.json
# mode "listen"). Requests carrying a sessionId are handled only by the
# matching Antigravity conversationId, so an unrelated session cannot steal
# them. The default mode, "accumulate" (absent control.json), never drains.
#
# Designed to never break a session: any unexpected condition prints {} and
# exits 0 (allow the stop) rather than erroring.

allow_stop() {
  printf '{}\n'
  exit 0
}

# Read hook input from stdin (camelCase JSON per Antigravity Stop contract).
input=$(cat 2>/dev/null || true)

# Global opt-out: mirrors the web-side kill switch so unrelated sessions never
# get their stop blocked by moonshine feedback.
case "${MOONSHINE_FEEDBACK:-}" in
  0|off|OFF|false|FALSE|no|NO) allow_stop ;;
esac

# jq is required to parse/rewrite the JSON records; without it, no-op.
command -v jq >/dev/null 2>&1 || allow_stop

# Don't loop: if a Stop hook already kept the agent going this turn, let it stop.
cont_active=$(printf '%s' "$input" | jq -r '.continuationActive // false' 2>/dev/null || echo false)
[ "$cont_active" = "true" ] && allow_stop

# Only intercept normal turn completions; never override user cancellation,
# errors, or invocation/token caps.
term_reason=$(printf '%s' "$input" | jq -r '.terminationReason // empty' 2>/dev/null || echo "")
if [ -n "$term_reason" ] && [ "$term_reason" != "NO_TOOL_CALL" ]; then
  allow_stop
fi

hook_session=$(printf '%s' "$input" | jq -r '.conversationId // empty' 2>/dev/null || echo "")

now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
now_epoch=$(date +%s)
root="${MOONSHINE_HOME:-$HOME/.agent/moonshine}"
# Re-surface delivered-but-unaddressed comments after this many seconds so an
# interrupted turn does not strand them forever.
STALE_DELIVERED_SEC=300
shopt -s nullglob

# Portable ISO-8601 UTC ("…Z") -> epoch seconds (GNU date and BSD/macOS date).
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
  # "antigravity present but off" from "no agent connected".
  [ -f "$fb/adapter.json" ] || \
    printf '{"harness":"antigravity","version":"adapter","installedAt":"%s"}\n' "$now" \
      > "$fb/adapter.json" 2>/dev/null || true

  mode="accumulate"
  control_session=""
  if [ -f "$fb/control.json" ]; then
    m=$(jq -r '.mode // empty' "$fb/control.json" 2>/dev/null || echo "")
    [ -n "$m" ] && mode="$m"
    control_session=$(jq -r '.sessionId // empty' "$fb/control.json" 2>/dev/null || echo "")
  fi

  address_requested=no
  address_session=""
  if [ -f "$fb/address.json" ]; then
    address_requested=yes
    address_session=$(jq -r '.sessionId // empty' "$fb/address.json" 2>/dev/null || echo "")
  fi

  # Vite stamps new requests with the authoring session/conversation id. Only
  # that session's Stop hook may claim them; legacy unstamped files remain
  # compatible.
  requested_session=""
  if [ "$address_requested" = "yes" ]; then
    requested_session="$address_session"
  elif [ "$mode" = "listen" ]; then
    requested_session="$control_session"
  fi
  if [ -n "$requested_session" ] && [ "$hook_session" != "$requested_session" ]; then
    continue
  fi

  if [ "$address_requested" = "no" ]; then
    case "$mode" in paused|stopped) continue ;; esac
  fi
  if [ "$mode" != "listen" ] && [ "$address_requested" = "no" ]; then
    continue
  fi

  # Recover orphaned claims whose owning process has exited.
  for orphan in "$fb"/*.json.claiming.*; do
    [ -e "$orphan" ] || continue
    opid="${orphan##*.claiming.}"
    case "$opid" in ''|*[!0-9]*) : ;; *) kill -0 "$opid" 2>/dev/null && continue ;; esac
    base="${orphan%.claiming.*}"
    if [ -e "$base" ]; then rm -f "$orphan"; else mv "$orphan" "$base" 2>/dev/null || true; fi
  done

  # Claim pending comments plus delivered records past the staleness window.
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

    # Atomic rename for mutual exclusion across concurrent drainers.
    claimed="$f.claiming.$$"
    mv "$f" "$claimed" 2>/dev/null || continue

    tmp="$claimed.tmp"
    if jq --arg now "$now" '.status="delivered" | .deliveredAt=$now' "$claimed" > "$tmp" 2>/dev/null; then
      mv "$tmp" "$f"
      rm -f "$claimed"
    else
      rm -f "$tmp"
      mv "$claimed" "$f" 2>/dev/null || true
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
  when done, update $f -> .status=\"addressed\", .addressedAt, .reply=<one line>
"
  done

  [ "$address_requested" = "yes" ] && rm -f "$fb/address.json"

  # Nudge to start the idle listener when auto-address is on with no fresh heartbeat.
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

if [ "$count" -eq 0 ] && [ -z "$listen_waiting" ]; then
  allow_stop
fi

msg=""
if [ "$count" -gt 0 ]; then
  msg="The article author sent $count feedback comment(s) from the moonshine authorship HUD. Address each by editing the referenced source file, then record the outcome in its comment file (.status=\"addressed\", an ISO-8601 .addressedAt, and a one-line .reply). Comments:
$reason"
fi
if [ -n "$listen_waiting" ]; then
  msg="$msg
The author enabled feedback-listening for project(s):$listen_waiting but no listener is running. After handling any comments above, start the idle listener using the moonshine-listen skill."
fi

jq -n --arg r "$msg" '{decision:"continue", reason:$r}'
exit 0
