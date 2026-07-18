#!/usr/bin/env bash
# Reads/writes the per-repo GitHub-workflow config:
#   <repo-root>/.claude/gh-workflow.config.json
# Falls back to the legacy <repo-root>/.claude/work-issue.config.json for
# reads if the new file doesn't exist yet (repos configured by older runs).
# Repo root is discovered via `git rev-parse --show-toplevel` from the cwd.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  config.sh path                 Print the config file path for the current repo (may not exist)
  config.sh read                 Print the config JSON, or "{}" if none exists
  config.sh get <jq-path>        Print one value, e.g. config.sh get .projectBoard.number
  config.sh init                 Create .claude/ dir + config if missing (migrates legacy file)
EOF
  exit 1
}

_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || { echo "not a git repo" >&2; exit 1; }
}

_config_path() {
  echo "$(_repo_root)/.claude/gh-workflow.config.json"
}

_legacy_path() {
  echo "$(_repo_root)/.claude/work-issue.config.json"
}

# Path to whichever file actually holds config right now: the new file if it
# exists, else the legacy file if it exists, else empty.
_live_path() {
  local p legacy
  p="$(_config_path)"; legacy="$(_legacy_path)"
  if [ -f "$p" ]; then echo "$p"
  elif [ -f "$legacy" ]; then echo "$legacy"
  fi
}

cmd="${1:-}"
[ $# -ge 1 ] && shift
case "$cmd" in
  path)
    _config_path
    ;;
  read)
    p="$(_live_path)"
    [ -n "$p" ] && cat "$p" || echo "{}"
    ;;
  get)
    [ $# -eq 1 ] || usage
    p="$(_live_path)"
    if [ -n "$p" ]; then
      jq -r "$1 // empty" "$p"
    fi
    ;;
  init)
    p="$(_config_path)"
    legacy="$(_legacy_path)"
    mkdir -p "$(dirname "$p")"
    if [ ! -f "$p" ]; then
      if [ -f "$legacy" ]; then
        cp "$legacy" "$p"   # migrate; leave the legacy file for the user to delete
      else
        echo '{}' > "$p"
      fi
    fi
    echo "$p"
    ;;
  *) usage ;;
esac
