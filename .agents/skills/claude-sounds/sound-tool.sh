#!/usr/bin/env bash
# claude-sounds helper — the verbs the /sound-setup wizard drives.
#
#   sound-tool.sh play <slot|path>          play a sound now
#   sound-tool.sh preview <event>           play what an event currently maps to
#   sound-tool.sh list                      show every event and its slot
#   sound-tool.sh slots                     list installed sound files
#   sound-tool.sh search <terms...>         find candidates on myinstants
#   sound-tool.sh fetch <slot> <url>        download a sound into a slot
#   sound-tool.sh set <event> <slot>        map an event to a slot
#   sound-tool.sh mute <event>              silence one event
#   sound-tool.sh custom add <regex> <slot> add a custom text trigger
#   sound-tool.sh custom list               show custom triggers
#   sound-tool.sh custom clear              remove all custom triggers
#   sound-tool.sh pack <name>               install a whole pack
#   sound-tool.sh test <event>              fire the hook as if <event> happened
#
# Every write goes to ~/.claude/hooks/sound-rules.json, which the hook re-reads
# on each event — changes apply immediately, no reinstall, no restart.

set -uo pipefail

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-${HOME}/.claude}"
HOOK_DIR="${CLAUDE_DIR}/hooks"
SOUND_DIR="${CLAUDE_SOUNDS_DIR:-${HOOK_DIR}/sounds}"
RULES="${CLAUDE_SOUNDS_RULES:-${HOOK_DIR}/sound-rules.json}"
HOOK="${HOOK_DIR}/status-sound.sh"
REPO_RAW="${CLAUDE_SOUNDS_RAW:-https://raw.githubusercontent.com/guillermoscript/agent-skills/main/skills/claude-sounds}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

ALL_EVENTS="done_tiny done_small done_medium done_big done_epic failed failed_big needs_input other commit push pr_opened pr_merged tests_pass tests_fail permission"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || die "jq is required"

ensure_rules() {
  mkdir -p "$HOOK_DIR"
  [ -f "$RULES" ] || jq -n '{pack:"tiktok",enabled:true,events:{},custom:[]}' > "$RULES"
  jq -e . "$RULES" >/dev/null 2>&1 || die "$RULES is not valid JSON"
}

write_rules() { # write_rules <jq-filter> [args...]
  ensure_rules
  local tmp; tmp=$(mktemp)
  jq "$@" "$RULES" > "$tmp" || { rm -f "$tmp"; die "failed to update rules"; }
  mv "$tmp" "$RULES"
}

# Resolve an event to the slot it currently plays.
slot_for() { # slot_for <event>
  local e="$1" s=""
  if [ -f "$RULES" ] && jq -e . "$RULES" >/dev/null 2>&1; then
    if jq -e --arg k "$e" '(.events // {}) | has($k)' "$RULES" >/dev/null 2>&1; then
      s="$(jq -r --arg k "$e" '.events[$k] // ""' "$RULES")"
      printf '%s' "$s"; return   # may be empty = muted
    fi
  fi
  printf '%s' "$e"
}

play_file() {
  local f="$1"
  [ -r "$f" ] || die "no such sound: $f"
  if   command -v afplay >/dev/null 2>&1; then afplay "$f"
  elif command -v mpv    >/dev/null 2>&1; then mpv --no-video --really-quiet "$f"
  elif command -v ffplay >/dev/null 2>&1; then ffplay -nodisp -autoexit -loglevel quiet "$f"
  elif command -v mpg123 >/dev/null 2>&1; then mpg123 -q "$f"
  elif command -v paplay >/dev/null 2>&1; then paplay "$f"
  else die "no audio player found (afplay/mpv/ffplay/mpg123/paplay)"; fi
}

dur() { afinfo "$1" 2>/dev/null | awk -F': ' '/estimated duration/{printf "%.1fs", $2}'; }

cmd="${1:-}"; shift 2>/dev/null || true

case "$cmd" in

  play)
    t="${1:-}"; [ -n "$t" ] || die "usage: play <slot|path>"
    [ -f "$t" ] && play_file "$t" || play_file "${SOUND_DIR}/${t}.mp3"
    ;;

  preview)
    e="${1:-}"; [ -n "$e" ] || die "usage: preview <event>"
    s="$(slot_for "$e")"
    [ -n "$s" ] || { echo "${e} is muted"; exit 0; }
    echo "${e} -> ${s}"
    play_file "${SOUND_DIR}/${s}.mp3"
    ;;

  list)
    ensure_rules
    printf '%-14s %-16s %s\n' EVENT SLOT FILE
    for e in $ALL_EVENTS; do
      s="$(slot_for "$e")"
      if [ -z "$s" ]; then
        printf '%-14s %-16s %s\n' "$e" "(muted)" "-"
      else
        f="${SOUND_DIR}/${s}.mp3"
        if [ -r "$f" ]; then printf '%-14s %-16s %s\n' "$e" "$s" "$(dur "$f")"
        else                 printf '%-14s %-16s %s\n' "$e" "$s" "MISSING"; fi
      fi
    done
    n="$(jq -r '(.custom // []) | length' "$RULES" 2>/dev/null || echo 0)"
    [ "${n:-0}" -gt 0 ] && { echo; echo "custom triggers:"; \
      jq -r '(.custom // [])[] | "  /\(.match)/ -> \(.slot)"' "$RULES"; }
    ;;

  slots)
    ls -1 "${SOUND_DIR}"/*.mp3 2>/dev/null | while read -r f; do
      printf '  %-24s %s\n' "$(basename "$f" .mp3)" "$(dur "$f")"
    done
    ;;

  search)
    [ $# -gt 0 ] || die "usage: search <terms...>"
    q="$(printf '%s+' "$@" | sed 's/+$//')"
    curl -s -A "$UA" -e "https://www.myinstants.com/" \
      "https://www.myinstants.com/en/search/?name=${q}" \
      | grep -oE "/media/sounds/[A-Za-z0-9_.-]+\.mp3" \
      | sort -u | head -25 \
      | sed 's|^|  https://www.myinstants.com|'
    ;;

  fetch)
    slot="${1:-}"; url="${2:-}"
    [ -n "$slot" ] && [ -n "$url" ] || die "usage: fetch <slot> <url>"
    mkdir -p "$SOUND_DIR"
    curl -fsSL -A "$UA" -e "https://www.myinstants.com/" --max-time 30 \
      "$url" -o "${SOUND_DIR}/${slot}.mp3" || die "download failed"
    [ -s "${SOUND_DIR}/${slot}.mp3" ] || { rm -f "${SOUND_DIR}/${slot}.mp3"; die "empty download"; }
    echo "  ${slot}  $(dur "${SOUND_DIR}/${slot}.mp3")"
    ;;

  set)
    e="${1:-}"; s="${2:-}"
    [ -n "$e" ] && [ -n "$s" ] || die "usage: set <event> <slot>"
    write_rules --arg k "$e" --arg v "$s" '.events //= {} | .events[$k] = $v'
    echo "  ${e} -> ${s}"
    ;;

  mute)
    e="${1:-}"; [ -n "$e" ] || die "usage: mute <event>"
    write_rules --arg k "$e" '.events //= {} | .events[$k] = null'
    echo "  ${e} muted"
    ;;

  custom)
    sub="${1:-}"; shift 2>/dev/null || true
    case "$sub" in
      add)
        pat="${1:-}"; slot="${2:-}"
        [ -n "$pat" ] && [ -n "$slot" ] || die "usage: custom add <regex> <slot>"
        # Reject a malformed regex now rather than silently never matching.
        # grep exits 0 (match) or 1 (no match) on a valid pattern, 2 on a bad one.
        grep -qiE "$pat" /dev/null 2>/dev/null
        rc=$?
        if [ "$rc" -gt 1 ]; then die "not a valid regex: $pat"; fi
        write_rules --arg m "$pat" --arg s "$slot" \
          '.custom //= [] | .custom += [{match:$m, slot:$s}]'
        echo "  /${pat}/ -> ${slot}"
        ;;
      list)  ensure_rules; jq -r '(.custom // [])[] | "  /\(.match)/ -> \(.slot)"' "$RULES" ;;
      clear) write_rules '.custom = []'; echo "  cleared" ;;
      *) die "usage: custom add|list|clear" ;;
    esac
    ;;

  pack)
    p="${1:-}"; [ -n "$p" ] || die "usage: pack <tiktok|zelda|mario>"
    m=$(mktemp)
    if [ -n "${PACK_SRC:-}" ] && [ -f "${PACK_SRC}/${p}.txt" ]; then
      cp "${PACK_SRC}/${p}.txt" "$m"
    else
      curl -fsSL "${REPO_RAW}/packs/${p}.txt" -o "$m" || die "unknown pack: $p"
    fi
    mkdir -p "$SOUND_DIR"; got=0
    while read -r slot url; do
      case "$slot" in ''|\#*) continue ;; esac
      [ -z "${url:-}" ] && continue
      curl -fsSL -A "$UA" -e "https://www.myinstants.com/" --max-time 30 \
        "$url" -o "${SOUND_DIR}/${slot}.mp3" 2>/dev/null \
        && [ -s "${SOUND_DIR}/${slot}.mp3" ] && got=$((got+1)) \
        || rm -f "${SOUND_DIR}/${slot}.mp3"
    done < "$m"
    rm -f "$m"
    write_rules --arg p "$p" '.pack = $p'
    echo "  installed ${p}: ${got} sounds"
    ;;

  test)
    e="${1:-}"; [ -n "$e" ] || die "usage: test <event>"
    [ -x "$HOOK" ] || die "hook not installed at $HOOK"
    CLAUDE_SOUNDS_TEST_EVENT="$e" sh -c "echo '{}' | '$HOOK'"
    echo "  fired ${e}"
    ;;

  ""|--help|-h|help)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    ;;

  *) die "unknown command: $cmd (try --help)" ;;
esac
