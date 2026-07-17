---
name: gh-board
description: Operate any GitHub Projects (v2) board by name — add issues/PRs, find existing items, set Status/Priority/Size or any single-select field — without hardcoding field or option IDs. Use whenever the user asks to move an item on a project board ("move #123 to In Review", "add this PR to the board", "set priority to P1", "mark it Done"), or when another workflow skill needs board bookkeeping. Requires the board's owner and number (from .claude/gh-workflow.config.json via the gh-repo-config skill, or ask the user).
---

# GH Board — GitHub Projects (v2) operations by name

Everything here is backed by the bundled `scripts/board.sh`, which resolves
field and option IDs by **name at call time** via `gh project field-list` —
nothing is hardcoded to a specific board, so it works against any Projects v2
board. The script is bundled with this skill (not the target repo): invoke it
by the skill's own path, `<skill-dir>/scripts/board.sh`, where `<skill-dir>`
is wherever this SKILL.md was loaded from.

## Preconditions

The script needs two env vars on every call:

```bash
GH_PROJECT_OWNER=<github-org-or-user> GH_PROJECT_NUMBER=<number>
```

Resolve them in this order:

1. Already known in this session — use them.
2. The repo's workflow config: `.claude/gh-workflow.config.json`, key
   `projectBoard: { "owner": ..., "number": ... }`. Read it via the
   **`gh-repo-config`** skill's `config.sh get .projectBoard` (or plain `jq`
   if that skill isn't loaded).
3. Discover: `gh project list --owner <org-from-repo> --format json` — if
   exactly one open project plausibly covers this repo, propose it to the
   user. If none or ambiguous, ask which board (owner + number), and offer
   to save the answer to the config so it's never asked again.

If the user says there is no board, or none can be found, board operations
are simply skipped — that's an expected state, not a failure.

## Commands

```
board.sh add <issue-or-pr-url>              Add to board (idempotent), prints item id
board.sh find <owner/repo> <number>         Print item id for issue/PR #N; empty if absent
board.sh set-field <item-id> <field> <opt>  Set any single-select field by name
board.sh status <item-id> <name>            Shorthand: set-field ... Status <name>
board.sh priority <item-id> <name>          Shorthand: set-field ... Priority <name>
board.sh size <item-id> <name>              Shorthand: set-field ... Size <name>
board.sh has-field <field-name>             Exit 0 if the board has this field
```

`set-field` (and its shorthands) **warns and exits 0** when the board lacks
the field or option — a board without a Priority column shouldn't crash a
pipeline that tries to set one. Check the command's output if you need to
know whether the set actually happened.

## Recipes

**Find-or-add, then set status** — the standard bookkeeping move. `find`
first, because `add` on an existing item still costs an API call and you
usually want to know whether the item was already being tracked:

```bash
export GH_PROJECT_OWNER=<owner> GH_PROJECT_NUMBER=<number>
ITEM=$(<skill-dir>/scripts/board.sh find <owner>/<repo> <N>)
[ -z "$ITEM" ] && ITEM=$(<skill-dir>/scripts/board.sh add <issue-or-pr-url>)
<skill-dir>/scripts/board.sh status "$ITEM" "In Progress"
```

**Check before offering** — when deciding whether to even mention a field
like Size or Priority, probe first so you don't offer options the board
doesn't have:

```bash
<skill-dir>/scripts/board.sh has-field "Size" && echo "board tracks Size"
```

Match option names exactly as the board defines them (`"In Progress"`, not
`in-progress`). When unsure what options exist, list them:

```bash
gh project field-list "$GH_PROJECT_NUMBER" --owner "$GH_PROJECT_OWNER" \
  --format json --jq '.fields[] | {name, options: [.options[]?.name]}'
```

## Conventions worth keeping

- **Issues and PRs are separate board items.** A PR that closes an issue
  doesn't inherit the issue's board item — `add` the PR itself if it should
  appear on the board.
- **Let automation do the final flip.** An issue's Status flips to Done by
  the board's built-in automation when its closing PR merges — don't set
  Done manually and race it.
- **Draft PRs read as In Progress, ready PRs as In Review.** Whatever moves
  a PR out of draft should also move its board item.

## Failure modes

- **`set-field` warns "board has no field/option ... skipped"** — the board's
  fields or options were renamed/removed. Re-run the `field-list` command
  above to see what exists now; since everything resolves by name this
  usually just needs the caller to use the new name (and, if the name lives
  in a saved config, update the config).
- **`find` prints nothing** — the item isn't on this board. Expected; follow
  with `add`.
- **Auth/permission errors from `gh`** — the authenticated user may lack
  project scope: `gh auth refresh -s project` usually fixes it. Tell the
  user rather than retrying blindly.
