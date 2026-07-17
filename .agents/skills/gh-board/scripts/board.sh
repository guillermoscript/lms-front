#!/usr/bin/env bash
# Generic GitHub Projects (v2) helper — works against any project board, on any
# repo, as long as GH_PROJECT_OWNER and GH_PROJECT_NUMBER are set (env or flags).
# Field and option IDs are resolved by NAME at call time via `gh project
# field-list`, so nothing here is hardcoded to a specific board.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: board.sh <command> [args...]
Env (required): GH_PROJECT_OWNER, GH_PROJECT_NUMBER

Commands:
  add <issue-or-pr-url>              Add to board (idempotent), prints item id
  find <repo> <number>               Print item id for issue/PR #N (repo = owner/name); empty if absent
  set-field <item-id> <field> <opt>  Set any single-select field (e.g. Status, Priority, Size) by name
  status <item-id> <name>            Shorthand for: set-field <item-id> Status <name>
  priority <item-id> <name>          Shorthand for: set-field <item-id> Priority <name>
  size <item-id> <name>              Shorthand for: set-field <item-id> Size <name>
  has-field <field-name>             Exit 0 if the board has this field, 1 otherwise (prints nothing)
EOF
  exit 1
}

: "${GH_PROJECT_OWNER:?set GH_PROJECT_OWNER to the project's owner (org or user login)}"
: "${GH_PROJECT_NUMBER:?set GH_PROJECT_NUMBER to the project's number}"

_project_id() {
  gh project view "$GH_PROJECT_NUMBER" --owner "$GH_PROJECT_OWNER" --format json --jq '.id'
}

# Resolves a single-select field's id + its option id for a given option name.
# Prints "<field-id> <option-id>" on success; exits 1 (silently) if either is missing.
_resolve_option() {
  local field_name="$1" option_name="$2"
  gh project field-list "$GH_PROJECT_NUMBER" --owner "$GH_PROJECT_OWNER" --format json \
    --jq ".fields[] | select(.name==\"$field_name\") |
          . as \$f | .options[]? | select(.name==\"$option_name\") |
          \"\(\$f.id) \(.id)\"" 2>/dev/null | head -1
}

cmd="${1:-}"
[ $# -ge 1 ] && shift
case "$cmd" in
  add)
    [ $# -eq 1 ] || usage
    gh project item-add "$GH_PROJECT_NUMBER" --owner "$GH_PROJECT_OWNER" --url "$1" --format json --jq '.id'
    ;;
  find)
    [ $# -eq 2 ] || usage
    repo="$1"; number="$2"
    owner="${repo%%/*}"; name="${repo##*/}"
    gh api graphql \
      -F owner="$owner" -F repo="$name" -F number="$number" \
      -f query='query($owner:String!,$repo:String!,$number:Int!){
        repository(owner:$owner,name:$repo){
          issueOrPullRequest(number:$number){
            ... on Issue { projectItems(first:20){ nodes { id project { number owner { ... on Organization { login } ... on User { login } } } } } }
            ... on PullRequest { projectItems(first:20){ nodes { id project { number owner { ... on Organization { login } ... on User { login } } } } } }
          }
        }
      }' \
      --jq ".data.repository.issueOrPullRequest.projectItems.nodes[] | select(.project.number==$GH_PROJECT_NUMBER and .project.owner.login==\"$GH_PROJECT_OWNER\") | .id"
    ;;
  set-field)
    [ $# -eq 3 ] || usage
    item_id="$1" field_name="$2" option_name="$3"
    read -r field_id option_id <<<"$(_resolve_option "$field_name" "$option_name")"
    if [ -z "${field_id:-}" ] || [ -z "${option_id:-}" ]; then
      echo "warn: board has no field \"$field_name\" with option \"$option_name\" — skipped" >&2
      exit 0
    fi
    gh project item-edit --project-id "$(_project_id)" --id "$item_id" \
      --field-id "$field_id" --single-select-option-id "$option_id" >/dev/null
    echo "$field_name -> $option_name"
    ;;
  status) [ $# -eq 2 ] || usage; exec "$0" set-field "$1" "Status" "$2" ;;
  priority) [ $# -eq 2 ] || usage; exec "$0" set-field "$1" "Priority" "$2" ;;
  size) [ $# -eq 2 ] || usage; exec "$0" set-field "$1" "Size" "$2" ;;
  has-field)
    [ $# -eq 1 ] || usage
    gh project field-list "$GH_PROJECT_NUMBER" --owner "$GH_PROJECT_OWNER" --format json \
      --jq ".fields[] | select(.name==\"$1\") | .id" 2>/dev/null | grep -q .
    ;;
  *) usage ;;
esac
