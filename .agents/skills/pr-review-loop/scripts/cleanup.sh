#!/usr/bin/env bash
# Post-merge local cleanup for a PR workflow — remove the worktree, delete the
# branch, return to an up-to-date default branch, drop scratch artifacts.
#
# Every destructive command here is guarded by a check that runs FIRST and wins:
# uncommitted changes, stashes, or unpushed commits abort that specific deletion
# and report why, rather than destroying work that only exists locally. Guards
# live in this script rather than in prose so they can't be skipped by a model
# reading the skill in a hurry.
#
# Exit codes: 0 = did the work (or safely skipped it), 1 = usage/precondition error.
# A refused deletion is NOT an error — it prints "SKIPPED: <reason>" and exits 0,
# because a held-back worktree is a correct outcome the caller must report, not
# a failure the caller should retry.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: cleanup.sh <command> [args...]

Commands:
  check <branch>                 Report cleanup safety for <branch> without changing
                                 anything. Prints one KEY=VALUE per line:
                                 dirty, stashes, unpushed, worktree, current, default.
  branch <branch>                Delete local <branch> (guarded), prune the remote ref
  worktree <path>                Remove the worktree at <path> (guarded)
  main                           Switch to the default branch and fast-forward it
  scratch <dir> <glob> [glob...] Delete matching scratch artifacts under <dir>
  all <branch> [worktree-path]   check → worktree → branch → main, in that order

Notes:
  * Run `all` from OUTSIDE the worktree being removed, or from the repo it belongs
    to — git refuses to remove the worktree you are standing in.
  * `branch` never deletes the branch you are currently on; it switches to the
    default branch first.
EOF
  exit 1
}

_default_branch() {
  # Prefer the remote's HEAD; fall back to gh, then to a local guess. Any repo
  # whose default isn't literally "main" (master, develop, trunk) resolves
  # correctly here instead of being hardcoded.
  git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' \
    || gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null \
    || echo main
}

# How many commits on <branch> exist ONLY here? This is the load-bearing guard:
# unpushed work is the one thing a branch deletion destroys irrecoverably.
#
# Uses `git cherry`, which compares *patch ids*, not reachability — and that
# distinction is the whole point. After a squash merge (the default in this
# workflow) the branch tip is not an ancestor of the default branch, so a
# reachability test like `rev-list --count def..branch` reports every
# squash-merged branch as unpushed and cleanup would refuse to delete anything,
# forever. `git cherry` marks a commit `-` when its patch is already upstream
# and `+` when it is not, so a squashed branch reads as 0 and genuinely local
# work reads as > 0.
_unpushed_count() {
  local branch="$1" upstream
  # Compare against the branch's own upstream when it still exists, otherwise
  # against the default branch — `gh pr merge --delete-branch` removes the
  # remote ref, which is the normal post-merge state.
  if ! upstream=$(git rev-parse --abbrev-ref --symbolic-full-name "${branch}@{upstream}" 2>/dev/null); then
    upstream="origin/$(_default_branch)"
  fi
  git show-ref --quiet --verify "refs/remotes/$upstream" 2>/dev/null \
    || upstream="origin/$(_default_branch)"
  git cherry "$upstream" "$branch" 2>/dev/null | grep -c '^+' || true
}

_worktree_for_branch() {
  # Prints the worktree path checked out on <branch>, if any.
  git worktree list --porcelain 2>/dev/null | awk -v b="refs/heads/$1" '
    /^worktree /  { path = substr($0, 10) }
    /^branch /    { if (substr($0, 8) == b) { print path; exit } }'
}

cmd="${1:-}"
[ $# -ge 1 ] && shift

case "$cmd" in
  check)
    [ $# -eq 1 ] || usage
    branch="$1"
    def=$(_default_branch)
    echo "dirty=$(git status --porcelain | wc -l | tr -d ' ')"
    echo "stashes=$(git stash list | wc -l | tr -d ' ')"
    echo "unpushed=$(_unpushed_count "$branch")"
    echo "worktree=$(_worktree_for_branch "$branch")"
    echo "current=$(git rev-parse --abbrev-ref HEAD)"
    echo "default=$def"
    ;;

  worktree)
    [ $# -eq 1 ] || usage
    path="$1"
    if [ ! -d "$path" ]; then
      echo "SKIPPED: no worktree at $path (already removed?)"
      exit 0
    fi
    # A worktree is the riskiest thing to remove: it can hold uncommitted work
    # that exists nowhere else. Check ITS tree, not the caller's.
    dirty=$(git -C "$path" status --porcelain | wc -l | tr -d ' ')
    if [ "$dirty" -ne 0 ]; then
      echo "SKIPPED: worktree $path has $dirty uncommitted change(s) — kept for review"
      git -C "$path" status --short
      exit 0
    fi
    wt_branch=$(git -C "$path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ -n "$wt_branch" ] && [ "$wt_branch" != "HEAD" ]; then
      unpushed=$(cd "$path" && _unpushed_count "$wt_branch")
      if [ "$unpushed" != "0" ]; then
        echo "SKIPPED: worktree $path has $unpushed unpushed commit(s) on $wt_branch — kept"
        exit 0
      fi
    fi
    git worktree remove "$path"
    echo "removed worktree $path"
    ;;

  branch)
    [ $# -eq 1 ] || usage
    branch="$1"
    if ! git show-ref --quiet --verify "refs/heads/$branch"; then
      echo "SKIPPED: no local branch $branch (already deleted?)"
      git remote prune origin >/dev/null 2>&1 || true
      exit 0
    fi
    unpushed=$(_unpushed_count "$branch")
    if [ "$unpushed" != "0" ]; then
      echo "SKIPPED: $branch has $unpushed commit(s) not on the remote or default branch — kept"
      exit 0
    fi
    wt=$(_worktree_for_branch "$branch")
    if [ -n "$wt" ]; then
      echo "SKIPPED: $branch is checked out in worktree $wt — remove that first"
      exit 0
    fi
    if [ "$(git rev-parse --abbrev-ref HEAD)" = "$branch" ]; then
      git checkout --quiet "$(_default_branch)"
    fi
    # -D not -d: a squash-merged branch is never "merged" by git's reachability
    # test, and the unpushed guard above already established the work survived.
    git branch -D "$branch"
    git remote prune origin >/dev/null 2>&1 || true
    echo "deleted branch $branch"
    ;;

  main)
    [ $# -eq 0 ] || usage
    def=$(_default_branch)
    dirty=$(git status --porcelain | wc -l | tr -d ' ')
    if [ "$dirty" -ne 0 ]; then
      echo "SKIPPED: working tree has $dirty uncommitted change(s) — not switching to $def"
      exit 0
    fi
    git checkout --quiet "$def"
    # --ff-only: never create a merge commit on the default branch during cleanup.
    if git pull --ff-only --quiet 2>/dev/null; then
      echo "on $def, fast-forwarded to $(git rev-parse --short HEAD)"
    else
      echo "on $def, but pull was not a fast-forward — local $def has diverged, left alone"
    fi
    ;;

  scratch)
    [ $# -ge 2 ] || usage
    dir="$1"; shift
    if [ ! -d "$dir" ]; then
      echo "SKIPPED: no scratch dir $dir"
      exit 0
    fi
    # Refuse to operate outside a scratchpad/tmp path: this command takes globs,
    # and a mistyped dir must not become a recursive delete somewhere real.
    case "$dir" in
      *scratchpad*|/tmp/*|/private/tmp/*|/var/folders/*) ;;
      *) echo "REFUSED: $dir is not a scratchpad/tmp path" >&2; exit 1 ;;
    esac
    n=0
    for glob in "$@"; do
      for f in "$dir"/$glob; do
        [ -e "$f" ] || continue
        rm -rf -- "$f"
        n=$((n + 1))
      done
    done
    echo "deleted $n scratch artifact(s) from $dir"
    ;;

  all)
    [ $# -ge 1 ] && [ $# -le 2 ] || usage
    branch="$1"; wt="${2:-$(_worktree_for_branch "$1")}"
    echo "--- check"
    "$0" check "$branch"
    if [ -n "$wt" ]; then
      echo "--- worktree"
      "$0" worktree "$wt"
    fi
    echo "--- branch"
    "$0" branch "$branch"
    echo "--- main"
    "$0" main
    ;;

  *) usage ;;
esac
