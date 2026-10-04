#!/usr/bin/env bash
# claude-sounds installer — sounds for Claude Code events.
#
#   curl -fsSL https://raw.githubusercontent.com/guillermoscript/agent-skills/main/skills/claude-sounds/install.sh | bash
#
# Flags:
#   --pack <name> tiktok (default) | zelda | mario
#   --uninstall   remove hooks, sounds and the skill, restore settings
#   --no-sounds   install the hooks but skip downloading audio (uses `say`)
#   --no-git      only wire turn-end sounds, skip the git/gh + waiting hooks
#   --no-skill    skip the /sound-setup wizard skill
#   --dry-run     show what would change, touch nothing
#   --yes         don't prompt
#
# Installs to:
#   ~/.claude/hooks/status-sound.sh    the dispatcher
#   ~/.claude/hooks/sound-tool.sh      the verbs (list, set, preview, pack, ...)
#   ~/.claude/hooks/sounds/*.mp3       the audio
#   ~/.claude/hooks/sound-rules.json   your event -> sound mapping (kept on reinstall)
#   ~/.claude/skills/sound-setup/      the /sound-setup wizard
#   ~/.claude/settings.json            Stop + PostToolUse + Notification entries (merged, not replaced)

set -uo pipefail

REPO_RAW="${CLAUDE_SOUNDS_RAW:-https://raw.githubusercontent.com/guillermoscript/agent-skills/main/skills/claude-sounds}"
# The wizard skill is a sibling directory in the repo, not under claude-sounds.
SKILL_RAW="${CLAUDE_SOUNDS_SKILL_RAW:-${REPO_RAW%/*}/sound-setup}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-${HOME}/.claude}"
HOOK_DIR="${CLAUDE_DIR}/hooks"
SOUND_DIR="${HOOK_DIR}/sounds"
HOOK_PATH="${HOOK_DIR}/status-sound.sh"
TOOL_PATH="${HOOK_DIR}/sound-tool.sh"
RULES_PATH="${HOOK_DIR}/sound-rules.json"
SKILL_DIR="${CLAUDE_DIR}/skills/sound-setup"
SETTINGS="${CLAUDE_DIR}/settings.json"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

PACK="tiktok"
DO_UNINSTALL=0; DO_SOUNDS=1; DO_GIT=1; DO_SKILL=1; DRY_RUN=0; ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pack)      PACK="${2:-}"; shift 2 || true; continue ;;
    --pack=*)    PACK="${1#*=}" ;;
    --uninstall) DO_UNINSTALL=1 ;;
    --no-sounds) DO_SOUNDS=0 ;;
    --no-git)    DO_GIT=0 ;;
    --no-skill)  DO_SKILL=0 ;;
    --dry-run)   DRY_RUN=1 ;;
    --yes|-y)    ASSUME_YES=1 ;;
    --help|-h)   sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

case "$PACK" in
  tiktok|zelda|mario) ;;
  *) echo "unknown pack: $PACK (choose tiktok, zelda or mario)" >&2; exit 2 ;;
esac

say_step() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
say_ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$1"; }
say_warn() { printf '\033[1;33m  !!\033[0m %s\n' "$1"; }
say_err()  { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; }

# ------------------------------------------------------------- prerequisites --
command -v jq >/dev/null 2>&1 || {
  say_err "jq is required but not installed."
  echo "  macOS:  brew install jq"
  echo "  Debian: sudo apt install jq"
  exit 1
}
command -v curl >/dev/null 2>&1 || { say_err "curl is required."; exit 1; }

# A player is needed for real audio; without one we degrade to `say`.
PLAYER=""
for p in afplay mpv ffplay mpg123 paplay; do
  command -v "$p" >/dev/null 2>&1 && { PLAYER="$p"; break; }
done

# Every hook entry we own carries this marker, so uninstall and reinstall can
# find them regardless of which events are wired.
MARKER="status-sound"

# ----------------------------------------------------------------- uninstall --
if [ "$DO_UNINSTALL" = "1" ]; then
  say_step "Uninstalling claude-sounds"
  if [ -f "$SETTINGS" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      say_ok "[dry-run] would remove hook entries from $SETTINGS"
    else
      cp "$SETTINGS" "${SETTINGS}.bak.$(date +%s)"
      tmp=$(mktemp)
      # Drop our hooks from every event, then drop groups left empty, then
      # drop events left with no groups. Unrelated hooks are untouched.
      jq --arg m "$MARKER" '
          reduce ["Stop","PostToolUse","Notification"][] as $e (.;
            if (.hooks[$e]? // null) == null then .
            else
              .hooks[$e] |= (map(.hooks |= map(select((.command // "") | test($m) | not)))
                             | map(select((.hooks | length) > 0)))
              | if (.hooks[$e] | length) == 0 then del(.hooks[$e]) else . end
            end)
        | if (.hooks? // {}) == {} then del(.hooks) else . end
      ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
      say_ok "removed hook entries (backup saved)"
    fi
  fi
  if [ "$DRY_RUN" = "1" ]; then
    say_ok "[dry-run] would delete $HOOK_PATH, $TOOL_PATH, $SOUND_DIR, $RULES_PATH and $SKILL_DIR"
  else
    rm -f "$HOOK_PATH" "$TOOL_PATH" "$RULES_PATH"; rm -rf "$SOUND_DIR"
    say_ok "removed hook, tool, rules and sounds"
    # Only remove the skill if it is ours — never touch a same-named skill
    # the user wrote or installed some other way.
    if [ -f "${SKILL_DIR}/SKILL.md" ] \
       && grep -q '^name: sound-setup' "${SKILL_DIR}/SKILL.md" 2>/dev/null; then
      rm -rf "$SKILL_DIR"
      say_ok "removed the /sound-setup skill"
    fi
  fi
  echo; say_step "Done. Restart Claude Code (or open /hooks) to apply."
  exit 0
fi

# -------------------------------------------------------------------- install --
echo
echo "  claude-sounds — sounds for Claude Code"
echo "  A sound when a turn ends, scaled by how much code was written,"
echo "  plus commits, pushes, PRs and test runs."
echo "  pack: ${PACK}"
echo

[ "$DRY_RUN" = "1" ] && say_warn "dry-run: nothing will be written"

if [ "$ASSUME_YES" != "1" ] && [ "$DRY_RUN" != "1" ] && [ -t 0 ]; then
  printf "Install to %s? [Y/n] " "$CLAUDE_DIR"
  read -r reply </dev/tty || reply=y
  case "$reply" in [nN]*) echo "aborted."; exit 0 ;; esac
fi

# 1. hook script
say_step "Installing hook"
if [ "$DRY_RUN" = "1" ]; then
  say_ok "[dry-run] would write $HOOK_PATH"
else
  mkdir -p "$HOOK_DIR"
  if [ -f "${SCRIPT_SRC:-}" ]; then
    cp "$SCRIPT_SRC" "$HOOK_PATH"
  else
    curl -fsSL "${REPO_RAW}/status-sound.sh" -o "$HOOK_PATH" || {
      say_err "could not download status-sound.sh"; exit 1; }
  fi
  chmod +x "$HOOK_PATH"
  say_ok "$HOOK_PATH"

  # The verbs /sound-setup drives (and anyone can run by hand).
  if [ -f "${TOOL_SRC:-}" ]; then
    cp "$TOOL_SRC" "$TOOL_PATH"
  else
    curl -fsSL "${REPO_RAW}/sound-tool.sh" -o "$TOOL_PATH" 2>/dev/null || true
  fi
  if [ -s "$TOOL_PATH" ]; then
    chmod +x "$TOOL_PATH"
    say_ok "$TOOL_PATH"
  else
    rm -f "$TOOL_PATH"
    say_warn "could not install sound-tool.sh (the /sound-setup wizard needs it)"
  fi
fi

# 1b. the /sound-setup wizard skill
if [ "$DO_SKILL" = "1" ]; then
  say_step "Installing the /sound-setup wizard"
  if [ "$DRY_RUN" = "1" ]; then
    say_ok "[dry-run] would write ${SKILL_DIR}/SKILL.md"
  else
    mkdir -p "$SKILL_DIR"
    if [ -f "${SKILL_SRC:-}" ]; then
      cp "$SKILL_SRC" "${SKILL_DIR}/SKILL.md"
    else
      curl -fsSL "${SKILL_RAW}/SKILL.md" -o "${SKILL_DIR}/SKILL.md" 2>/dev/null || true
    fi
    # A skill without frontmatter won't register, so don't leave a broken one.
    if [ -s "${SKILL_DIR}/SKILL.md" ] \
       && head -1 "${SKILL_DIR}/SKILL.md" | grep -q '^---'; then
      say_ok "${SKILL_DIR}/SKILL.md  (use /sound-setup)"
    else
      rm -rf "$SKILL_DIR"
      say_warn "could not install the skill — use ${TOOL_PATH} directly instead"
    fi
  fi
fi

# 2. sounds
if [ "$DO_SOUNDS" = "1" ]; then
  say_step "Downloading the ${PACK} pack"
  if [ "$DRY_RUN" = "1" ]; then
    say_ok "[dry-run] would download sounds to $SOUND_DIR"
  else
    mkdir -p "$SOUND_DIR"
    manifest=$(mktemp)
    if [ -f "${MANIFEST_SRC:-}" ]; then
      cp "$MANIFEST_SRC" "$manifest"
    elif [ -n "${PACK_SRC:-}" ] && [ -f "${PACK_SRC}/${PACK}.txt" ]; then
      cp "${PACK_SRC}/${PACK}.txt" "$manifest"
    else
      curl -fsSL "${REPO_RAW}/packs/${PACK}.txt" -o "$manifest" || {
        say_err "could not download packs/${PACK}.txt"; exit 1; }
    fi

    got=0; missed=0
    while read -r slot url; do
      case "$slot" in ''|\#*) continue ;; esac
      [ -z "${url:-}" ] && continue
      if curl -fsSL -A "$UA" -e "https://www.myinstants.com/" --max-time 30 \
           "$url" -o "${SOUND_DIR}/${slot}.mp3" 2>/dev/null \
         && [ -s "${SOUND_DIR}/${slot}.mp3" ]; then
        got=$((got+1))
      else
        rm -f "${SOUND_DIR}/${slot}.mp3"; missed=$((missed+1))
        say_warn "could not fetch ${slot} — will fall back to a spoken sound"
      fi
    done < "$manifest"
    rm -f "$manifest"
    say_ok "${got} sounds in ${SOUND_DIR}"
    [ "$missed" -gt 0 ] && say_warn "${missed} unavailable (source may have removed them)"
  fi
else
  say_step "Skipping sounds (--no-sounds); the hook will use spoken fallbacks"
fi

# 3. rules file — never overwrite a customized one
say_step "Setting up rules"
if [ "$DRY_RUN" = "1" ]; then
  say_ok "[dry-run] would write $RULES_PATH (if absent)"
elif [ -f "$RULES_PATH" ]; then
  # Keep the user's mapping; just record the pack they last installed.
  tmp=$(mktemp)
  if jq --arg p "$PACK" '.pack = $p' "$RULES_PATH" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$RULES_PATH"
    say_ok "kept your existing rules (pack set to ${PACK})"
  else
    rm -f "$tmp"
    say_warn "$RULES_PATH is not valid JSON — leaving it alone"
  fi
else
  jq -n --arg p "$PACK" '{pack: $p, enabled: true, events: {}, custom: []}' \
    > "$RULES_PATH"
  say_ok "$RULES_PATH"
fi

# 4. settings.json — merge, never clobber
if [ "$DO_GIT" = "1" ]; then
  say_step "Wiring hooks (turn end, git/gh, waiting)"
else
  say_step "Wiring hook (turn end only)"
fi
if [ "$DRY_RUN" = "1" ]; then
  say_ok "[dry-run] would add hook entries to $SETTINGS"
else
  mkdir -p "$CLAUDE_DIR"
  [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

  if ! jq empty "$SETTINGS" 2>/dev/null; then
    say_err "$SETTINGS is not valid JSON — fix it first, nothing was changed."
    exit 1
  fi

  cp "$SETTINGS" "${SETTINGS}.bak.$(date +%s)"
  tmp=$(mktemp)
  # Remove any prior copy of our hooks from every event, then append fresh
  # entries. Existing unrelated hooks are preserved.
  #
  # PostToolUse uses `if` gating (permission-rule syntax) so the hook process
  # only spawns for commands we actually react to — no per-Bash-call overhead.
  jq --arg cmd "$HOOK_PATH" --arg m "$MARKER" --argjson git "$DO_GIT" '
      def strip($e):
        if (.hooks[$e]? // null) == null then .
        else .hooks[$e] |= (map(.hooks |= map(select((.command // "") | test($m) | not)))
                            | map(select((.hooks | length) > 0)))
        end;

      .hooks //= {}
    | strip("Stop") | strip("PostToolUse") | strip("Notification")
    | .hooks.Stop //= []
    | .hooks.Stop += [{ matcher: "", hooks: [{ type: "command", command: $cmd, async: true }] }]
    | if $git == 1 then
          .hooks.PostToolUse //= []
        | .hooks.PostToolUse += [{
            matcher: "Bash",
            hooks: [
              { "if": "Bash(git commit *)",  type: "command", command: $cmd, async: true },
              { "if": "Bash(git push *)",    type: "command", command: $cmd, async: true },
              { "if": "Bash(gh pr create *)",type: "command", command: $cmd, async: true },
              { "if": "Bash(gh pr merge *)", type: "command", command: $cmd, async: true }
            ]
          }]
        | .hooks.Notification //= []
        | .hooks.Notification += [{
            matcher: "permission_prompt",
            hooks: [{ type: "command", command: $cmd, async: true }]
          }]
      else . end
  ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"

  if jq -e --arg c "$HOOK_PATH" '.hooks.Stop[].hooks[] | select(.command == $c)' \
       "$SETTINGS" >/dev/null 2>&1; then
    say_ok "hooks registered in $SETTINGS (backup saved)"
  else
    say_err "failed to register the hooks; your backup is beside $SETTINGS"
    exit 1
  fi
fi

# 5. demo
if [ "$DRY_RUN" != "1" ] && [ "$DO_SOUNDS" = "1" ] && [ -n "$PLAYER" ] \
   && [ -r "${SOUND_DIR}/done_epic.mp3" ]; then
  say_step "Preview: what a 1000+ line turn sounds like"
  ( STATUS_SOUND_TEST_STATUS=completed STATUS_SOUND_TEST_LINES=1500 \
    sh -c "echo '{}' | '$HOOK_PATH'" ) >/dev/null 2>&1
fi

echo
say_step "Installed."
[ -z "$PLAYER" ] && say_warn "no audio player found (afplay/mpv/ffplay/mpg123/paplay) — install one for real audio"
cat <<EOF

  When a turn ends, scaled by lines written:
    <50 / 50+ / 200+ / 500+ / 1000+   five escalating sounds
    needs input · failed · other      their own sounds
EOF
if [ "$DO_GIT" = "1" ]; then
cat <<EOF
  While you work:
    git commit · git push · gh pr create · gh pr merge
    test runs (pass and fail) · waiting for your permission
EOF
fi
cat <<EOF

  Restart Claude Code (or open /hooks once) to activate.

EOF
if [ -f "${SKILL_DIR}/SKILL.md" ]; then
cat <<EOF
  Change sounds:  /sound-setup   (wizard — plays each one as you pick)
  Or by hand:     bash ${TOOL_PATH} list
EOF
else
cat <<EOF
  Change sounds:  bash ${TOOL_PATH} list
EOF
fi
cat <<EOF
  Edit directly:  ${RULES_PATH}
  Swap a file:    ${SOUND_DIR}/<slot>.mp3
  Mute:           CLAUDE_SOUNDS_OFF=1
  Uninstall:      curl -fsSL ${REPO_RAW}/install.sh | bash -s -- --uninstall

EOF
