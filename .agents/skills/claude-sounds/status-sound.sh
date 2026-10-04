#!/usr/bin/env bash
# claude-sounds — one dispatcher, three hook events.
#
# Claude Code pipes the event to stdin as JSON. We look at hook_event_name to
# decide what happened, resolve it to a slot via the user's rules file, and
# play ~/.claude/hooks/sounds/<slot>.mp3.
#
#   Stop         -> classify how the turn ended (+ how big it was)
#   PostToolUse  -> a git/gh command just ran; did it succeed?
#   Notification -> Claude is waiting on you (permission prompt)
#
# TURN-END EVENTS (Stop), first match wins:
#   0. a `custom` regex rule in the rules file
#   1. `result:`      -> completed     (background-job marker)
#   2. `needs input:` -> needs_input   (background-job marker)
#   3. `failed:`      -> failed        (background-job marker)
#   4. ends with '?'  -> needs_input   (heuristic)
#   5. error keywords -> failed        (heuristic)
#   6. otherwise      -> other
#
# `completed` is then sized by lines written/edited THIS turn, against the
# thresholds in the rules file: done_tiny/small/medium/big/epic.
#
# GIT EVENTS (PostToolUse on Bash): commit, push, pr_opened, pr_merged,
# tests_pass, tests_fail — only fired when the command actually succeeded.
#
# Rules live at ~/.claude/hooks/sound-rules.json and are re-read every event,
# so edits apply immediately. With no rules file, built-in defaults are used
# and every event maps to its own name — i.e. exactly the pre-rules behaviour.
#
# Always exits 0 and never blocks; playback is detached so a long sound never
# delays the next prompt.
#
#   Mute:  CLAUDE_SOUNDS_OFF=1   (STATUS_SOUND_OFF=1 still honoured)
#   Debug: CLAUDE_SOUNDS_DEBUG=1 -> ~/.claude/claude-sounds.log
#   Test:  CLAUDE_SOUNDS_TEST_EVENT=pr_merged
#          STATUS_SOUND_TEST_STATUS=completed STATUS_SOUND_TEST_LINES=1500

set +e

# Legacy env var names kept working.
[ "${STATUS_SOUND_OFF:-}" = "1" ] && exit 0
[ "${CLAUDE_SOUNDS_OFF:-}" = "1" ] && exit 0
[ "${STATUS_SOUND_DEBUG:-}" = "1" ] && CLAUDE_SOUNDS_DEBUG=1

SOUND_DIR="${STATUS_SOUND_DIR:-${CLAUDE_SOUNDS_DIR:-${HOME}/.claude/hooks/sounds}}"
RULES="${CLAUDE_SOUNDS_RULES:-${HOME}/.claude/hooks/sound-rules.json}"
LOG="${HOME}/.claude/claude-sounds.log"

HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1

PAYLOAD="$(cat 2>/dev/null || true)"

# ------------------------------------------------------------------ rules ---
# A malformed rules file must never silence or break the hook: fall back to
# built-in defaults and carry on.
RULES_OK=0
if [ "${HAVE_JQ}" = "1" ] && [ -r "${RULES}" ] \
   && jq -e . "${RULES}" >/dev/null 2>&1; then
  RULES_OK=1
fi

rule() {  # rule <jq-path> <default>
  local out
  if [ "${RULES_OK}" = "1" ]; then
    out="$(jq -r "$1 // empty" "${RULES}" 2>/dev/null)"
    [ -n "${out}" ] && { printf '%s' "${out}"; return; }
  fi
  printf '%s' "$2"
}

# NB: `.enabled // true` would be wrong — jq's `//` treats `false` as absent
# and would substitute `true`, so an explicit `"enabled": false` would be
# ignored. Test for the literal value instead.
if [ "${RULES_OK}" = "1" ]; then
  if jq -e '.enabled == false' "${RULES}" >/dev/null 2>&1; then
    exit 0
  fi
fi

# ------------------------------------------------------------------ input ---
EVENT=""       # hook event name from Claude Code
TRANSCRIPT=""
TOOL_NAME=""
CMD=""
TOOL_OK=1
NOTIF_TYPE=""

if [ -n "${PAYLOAD}" ] && [ "${HAVE_JQ}" = "1" ]; then
  EVENT="$(printf '%s' "${PAYLOAD}" | jq -r '.hook_event_name // empty' 2>/dev/null)"
  TRANSCRIPT="$(printf '%s' "${PAYLOAD}" | jq -r '.transcript_path // empty' 2>/dev/null)"
  TOOL_NAME="$(printf '%s' "${PAYLOAD}" | jq -r '.tool_name // empty' 2>/dev/null)"
  CMD="$(printf '%s' "${PAYLOAD}" | jq -r '.tool_input.command // empty' 2>/dev/null)"
  NOTIF_TYPE="$(printf '%s' "${PAYLOAD}" | jq -r '.notification_type // empty' 2>/dev/null)"
  # tool_response shape varies by tool; treat an explicit failure signal as
  # failure and anything else as success.
  if printf '%s' "${PAYLOAD}" \
     | jq -e '(.tool_response.success == false)
              or ((.tool_response.interrupted // false) == true)
              or ((.tool_response.is_error // false) == true)' \
       >/dev/null 2>&1; then
    TOOL_OK=0
  fi
fi

# No event name (older builds, or hand-piped input) means Stop.
[ -z "${EVENT}" ] && EVENT="Stop"

EVENT_KEY=""   # what we resolve against the rules file
LABEL=""       # spoken fallback if the sound file is missing
LINES=0

# ------------------------------------------------------- PostToolUse: git ---
if [ "${EVENT}" = "PostToolUse" ]; then
  # Only Bash carries a shell command worth classifying.
  [ "${TOOL_NAME}" != "Bash" ] && exit 0
  [ -z "${CMD}" ] && exit 0
  # A failed command shouldn't celebrate. Tests are the exception: a failing
  # test run is itself an event worth hearing.
  LOWER_CMD="$(printf '%s' "${CMD}" | tr '[:upper:]' '[:lower:]')"

  case "${LOWER_CMD}" in
    *"gh pr merge"*)             EVENT_KEY="pr_merged"; LABEL="merged" ;;
    *"gh pr create"*)            EVENT_KEY="pr_opened"; LABEL="pull request opened" ;;
    *"git push"*)                EVENT_KEY="push";      LABEL="pushed" ;;
    *"git commit"*)              EVENT_KEY="commit";    LABEL="committed" ;;
    *"npm test"*|*"npm run test"*|*"yarn test"*|*"pnpm test"*|\
    *"pytest"*|*"go test"*|*"cargo test"*|*"jest"*|*"vitest"*|*"bun test"*)
      if [ "${TOOL_OK}" = "1" ]; then EVENT_KEY="tests_pass"; LABEL="tests pass"
      else                            EVENT_KEY="tests_fail"; LABEL="tests failed"
      fi
      ;;
    *) exit 0 ;;
  esac

  # Non-test git commands only celebrate on success.
  case "${EVENT_KEY}" in
    tests_pass|tests_fail) : ;;
    *) [ "${TOOL_OK}" = "1" ] || exit 0 ;;
  esac

# ------------------------------------------------- Notification: waiting ----
elif [ "${EVENT}" = "Notification" ]; then
  case "${NOTIF_TYPE}" in
    permission_prompt) EVENT_KEY="permission"; LABEL="waiting on you" ;;
    *) exit 0 ;;
  esac

# --------------------------------------------------------- Stop: turn end ---
else
  LAST_MSG=""
  if [ -n "${TRANSCRIPT}" ] && [ -r "${TRANSCRIPT}" ] && [ "${HAVE_JQ}" = "1" ]; then
    LAST_MSG="$(jq -r 'select(.type=="assistant")
        | .message.content[]?
        | select(.type=="text")
        | .text' "${TRANSCRIPT}" 2>/dev/null \
      | grep -v '^[[:space:]]*$' \
      | tail -40)"
  fi

  # macOS ships bash 3.2, so no ${x,,}.
  LOWER="$(printf '%s' "${LAST_MSG}" | tr '[:upper:]' '[:lower:]')"
  LAST_LINE="$(printf '%s' "${LAST_MSG}" | tail -1 | sed 's/[[:space:]]*$//')"

  # Custom regex rules win over everything, in file order.
  CUSTOM_SLOT=""
  if [ "${RULES_OK}" = "1" ] && [ -n "${LOWER}" ]; then
    CUSTOM_N="$(jq -r '(.custom // []) | length' "${RULES}" 2>/dev/null)"
    case "${CUSTOM_N}" in ''|*[!0-9]*) CUSTOM_N=0 ;; esac
    i=0
    while [ "${i}" -lt "${CUSTOM_N}" ]; do
      pat="$(jq -r ".custom[${i}].match // empty" "${RULES}" 2>/dev/null)"
      slot="$(jq -r ".custom[${i}].slot // empty" "${RULES}" 2>/dev/null)"
      if [ -n "${pat}" ] && [ -n "${slot}" ] \
         && printf '%s' "${LOWER}" | grep -qiE "${pat}" 2>/dev/null; then
        CUSTOM_SLOT="${slot}"
        LABEL="custom"
        break
      fi
      i=$((i + 1))
    done
  fi

  if [ -n "${CUSTOM_SLOT}" ]; then
    EVENT_KEY="custom"
  else
    STATUS="other"
    if printf '%s' "${LOWER}" | grep -qE '(^|[[:space:]])result:'; then
      STATUS="completed"
    elif printf '%s' "${LOWER}" | grep -qE '(^|[[:space:]])needs input:'; then
      STATUS="needs-input"
    elif printf '%s' "${LOWER}" | grep -qE '(^|[[:space:]])failed:'; then
      STATUS="failed"
    elif printf '%s' "${LAST_LINE}" | grep -q '?$'; then
      STATUS="needs-input"
    elif printf '%s' "${LOWER}" | grep -qE "error|failed|couldn't|could not|unable to|blocked"; then
      STATUS="failed"
    fi

    # Lines written/edited since the last user prompt = the size of THIS turn.
    if [ -n "${TRANSCRIPT}" ] && [ -r "${TRANSCRIPT}" ] && [ "${HAVE_JQ}" = "1" ]; then
      REVERSED="$(tac "${TRANSCRIPT}" 2>/dev/null || tail -r "${TRANSCRIPT}" 2>/dev/null)"
      LINES="$(printf '%s\n' "${REVERSED}" \
        | jq -rs '
            (map(select(.type=="user" or .type=="assistant"))
             | (map(.type=="user") | index(true)) // length) as $stop
            | .[0:$stop]
            | map(.message.content[]? // empty
                  | select(.type=="tool_use")
                  | if   .name=="Write" then (.input.content    // "")
                    elif .name=="Edit"  then (.input.new_string // "")
                    else "" end
                  | split("\n") | length)
            | add // 0' 2>/dev/null)"
    fi
    case "${LINES}" in ''|*[!0-9]*) LINES=0 ;; esac

    # Test overrides
    [ -n "${STATUS_SOUND_TEST_STATUS:-}" ] && STATUS="${STATUS_SOUND_TEST_STATUS}"
    [ -n "${STATUS_SOUND_TEST_LINES:-}" ]  && LINES="${STATUS_SOUND_TEST_LINES}"

    T_SMALL="$(rule '.thresholds.small' 50)"
    T_MED="$(rule '.thresholds.medium' 200)"
    T_BIG="$(rule '.thresholds.big' 500)"
    T_EPIC="$(rule '.thresholds.epic' 1000)"

    case "${STATUS}" in
      completed)
        if   [ "${LINES}" -ge "${T_EPIC}" ]; then EVENT_KEY="done_epic";   LABEL="I got this faaaaahhh"
        elif [ "${LINES}" -ge "${T_BIG}" ];  then EVENT_KEY="done_big";    LABEL="faaaaaaaaaaaa"
        elif [ "${LINES}" -ge "${T_MED}" ];  then EVENT_KEY="done_medium"; LABEL="faaaaaaa"
        elif [ "${LINES}" -ge "${T_SMALL}" ];then EVENT_KEY="done_small";  LABEL="faaaa"
        else                                      EVENT_KEY="done_tiny";   LABEL="yep"
        fi
        ;;
      needs-input) EVENT_KEY="needs_input"; LABEL="hmmm" ;;
      failed)
        if [ "${LINES}" -ge "${T_MED}" ]; then EVENT_KEY="failed_big"; LABEL="wah wah wah"
        else                                   EVENT_KEY="failed";     LABEL="bruh"
        fi
        ;;
      *) EVENT_KEY="other"; LABEL="ok" ;;
    esac
  fi
fi

# Manual override for testing.
[ -n "${CLAUDE_SOUNDS_TEST_EVENT:-}" ] && EVENT_KEY="${CLAUDE_SOUNDS_TEST_EVENT}"

[ -z "${EVENT_KEY}" ] && exit 0

# ------------------------------------------------- resolve event -> slot ---
if [ "${EVENT_KEY}" = "custom" ]; then
  SLOT="${CUSTOM_SLOT}"
else
  # Default: the slot is named after the event. An explicit null means silence.
  if [ "${RULES_OK}" = "1" ] \
     && jq -e --arg k "${EVENT_KEY}" 'has("events") and (.events | has($k))' \
          "${RULES}" >/dev/null 2>&1; then
    SLOT="$(jq -r --arg k "${EVENT_KEY}" '.events[$k] // ""' "${RULES}" 2>/dev/null)"
    [ -z "${SLOT}" ] && exit 0   # mapped to null -> intentionally silent
  else
    SLOT="${EVENT_KEY}"
  fi
fi

SOUND="${SOUND_DIR}/${SLOT}.mp3"

if [ "${CLAUDE_SOUNDS_DEBUG:-}" = "1" ]; then
  printf '%s hook=%-13s event=%-12s lines=%-6s slot=%-14s (%s)\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${EVENT}" "${EVENT_KEY}" "${LINES}" \
    "${SLOT}" "${LABEL}" >> "${LOG}"
fi

# Detach playback so a long sound never delays the session.
play() {
  if   command -v afplay      >/dev/null 2>&1; then afplay "$1"
  elif command -v mpv         >/dev/null 2>&1; then mpv --no-video --really-quiet "$1"
  elif command -v ffplay      >/dev/null 2>&1; then ffplay -nodisp -autoexit -loglevel quiet "$1"
  elif command -v mpg123      >/dev/null 2>&1; then mpg123 -q "$1"
  elif command -v paplay      >/dev/null 2>&1; then paplay "$1"
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -c "(New-Object Media.SoundPlayer '$1').PlaySync()"
  else return 1; fi
}

if [ -r "${SOUND}" ]; then
  ( play "${SOUND}" >/dev/null 2>&1 & ) >/dev/null 2>&1
elif command -v say >/dev/null 2>&1 && [ -n "${LABEL}" ]; then
  # Sound file missing — fall back to a spoken reaction.
  ( say -v Boing "${LABEL}" >/dev/null 2>&1 & ) >/dev/null 2>&1
fi

exit 0
