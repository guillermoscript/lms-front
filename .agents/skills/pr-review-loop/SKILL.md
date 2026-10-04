---
name: pr-review-loop
description: Watch an open pull request you authored until it merges — poll it on an in-session cron for reviewer feedback, answer questions on the thread, implement requested changes and push them, iterate until approved, then merge, run the ship-pr close-out comments, settle the project board to Done, post a "merged" note to Slack (if connected), and clean up locally — remove the worktree, delete the merged branch, return to an up-to-date default branch, with guards that never destroy uncommitted or unpushed work. Keeps the board honest throughout — Changes Requested while we owe work, In Review while the reviewer does. Stateless — GitHub is the only state, so it resumes seamlessly after a dead session. Use when the user says "watch this PR", "start the review loop", "babysit the PR until it merges", "poll the PR for comments", "handle the review feedback on #N", or as the final step of an issue workflow after the PR is announced.
---

# PR Review Loop — from announced PR to merged, closed out

The gap this closes: after `ship-pr` announces a PR, nothing watches it.
This skill polls the PR for reviewer feedback, addresses each piece with
code or an answer, loops until the PR is approved, merges it, and triggers
`ship-pr`'s close-out — the whole review conversation handled without the
user shepherding it.

Two doctrines govern everything below:

- **Stateless — GitHub is the only state.** No watermark files, no local
  memory of what was processed. Each cycle rebuilds its work queue from
  the PR itself: a review thread is pending if it's unresolved and the
  last word isn't ours; a conversation comment is pending if it's newer
  than our last reply or push and isn't ours. A dead session, an expired
  cron, or a manual re-invoke all resume identically — just run a cycle.
- **The loop never reacts to its own comments.** "Ours" is the
  authenticated user (`gh api user -q .login`), resolved fresh each run.

Config (Slack channel, default reviewer, project board) comes from
`.claude/gh-workflow.config.json` via the **`gh-repo-config`** skill; board
moves go through **`gh-board`**; close-out comments belong to
**`ship-pr`**; local cleanup after the merge runs through this skill's own
`scripts/cleanup.sh`. Chat with the user may be
terse (caveman), but everything posted to GitHub or Slack is a permanent
record — normal, professional, full-sentence English.

Reviewing **someone else's** PR is the mirror skill, **`pr-review-watch`** —
it runs `/code-review`, submits an approve/request-changes verdict, and
re-reviews each new push. This skill is only for PRs we authored; one PR
never gets both loops.

## Invocation and arming

```
/pr-review-loop <pr-url | #N | N>
/pr-review-loop            # resolves the PR from the current branch
```

With no argument, resolve via `gh pr view --json number,url` on the
current branch. Verify the PR is open and authored by (or assigned to)
the authenticated user — this skill shepherds *our* PRs, not strangers'.

Then:

1. **Resolve the board item once**, if a board is configured, so later
   steps can move it without re-discovering anything:

   ```bash
   export GH_PROJECT_OWNER=<owner> GH_PROJECT_NUMBER=<number>
   PR_ITEM=$(<gh-board-dir>/scripts/board.sh find <owner>/<repo> <N>)
   ```

   Empty means the PR isn't on the board — `add` it. No board configured
   means every board step below is skipped silently.
2. **Run one cycle immediately** (below) — feedback may already be
   waiting.
3. **Arm the cron.** Check `CronList` first — one cron per PR, never two.
   If absent, `CronCreate` with a ~7-minute off-minute schedule (e.g.
   `*/7 * * * *`) and the prompt:
   `Run one pr-review-loop cycle for PR #<N> in <owner>/<repo> (skill: pr-review-loop).`
4. **Tell the user the cron's lifespan**: it lives only in this session
   and expires after 7 days — if the session ends before the merge,
   re-invoking `/pr-review-loop #<N>` catches up and re-arms. That's the
   designed resume path, not a failure.

## One polling cycle

### 1. PR state gate

```bash
gh pr view <N> --json state,reviewDecision,mergeStateStatus,headRefName,baseRefName,url
```

- `MERGED` (someone merged it for us) → disarm the cron, jump to
  close-out.
- `CLOSED` unmerged → disarm, report to the user, stop. Don't guess at a
  board status for an abandoned PR — ask the user whether the item should
  go back to the backlog or be dropped, since only they know why it was
  closed.
- Otherwise make sure the PR branch is checked out and up to date before
  any implementation work.

### 2. Build the work queue — from GitHub alone

Inline review threads, via GraphQL:

```bash
gh api graphql -f query='
  query($owner:String!, $repo:String!, $pr:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:100) {
          nodes {
            isResolved
            comments(first:50) {
              nodes { databaseId author{login} body path line url createdAt }
            }
          }
        }
      }
    }
  }' -F owner=<owner> -F repo=<repo> -F pr=<N>
```

A thread is **pending** if `isResolved` is false **and** its last comment
isn't ours. Conversation comments
(`gh api repos/<owner>/<repo>/issues/<N>/comments`) are pending if newer
than our last activity (our latest comment or push, whichever is later)
and not authored by us. Reviews with state `CHANGES_REQUESTED`
(`gh api repos/<owner>/<repo>/pulls/<N>/reviews`) whose body we haven't
answered are pending too.

**Empty queue and not approved → end the cycle silently.** A quiet poll
is the normal case; don't narrate it to the user.

### 3. Classify and act

For each pending item, judge which kind it is:

- **Question** — the reviewer wants an answer, not a change. Reply on the
  thread; no code.
- **Change request** — implement it on the PR branch. The main agent
  writes the code (never a subagent), runs the repo's checks
  (lint/typecheck/test, per the conventions from `gh-repo-config`
  discovery), commits following the repo convention with the
  Co-Authored-By trailer, and pushes. Group multiple requests into one
  focused commit per concern, not one giant "address review" blob.
- **Ambiguous, contradicts the issue's intent, or expands scope** — do
  not guess. Reply on the thread asking for clarification (or explaining
  the tension), and surface it to the user in-session. The item naturally
  stays pending until the reviewer answers — their reply makes the last
  word theirs again.

### 4. Reply to every handled item

Every pending item gets a reply saying what changed (or answering the
question), referencing the commit SHA for code changes. Inline threads:

```bash
gh api repos/<owner>/<repo>/pulls/<N>/comments/<comment-id>/replies -f body='...'
```

Conversation comments: `gh pr comment <N> --body-file <file>`.

**Never resolve threads.** The reviewer resolves; our job is to make the
last word ours. This is also what keeps statelessness sound — "handled"
means "we replied", not "thread closed", so open threads never stall the
loop.

### 5. Keep the board honest during review

A PR under review isn't in one state for days — it swings between "waiting
on the reviewer" and "waiting on us", and the board should say which:

- **We owe work** (`reviewDecision` is `CHANGES_REQUESTED`, or the queue
  has change requests) → `Changes Requested` if the board defines that
  option, else `In Progress`.
- **Reviewer owes a look** (queue empty, every item answered, not yet
  approved) → back to `In Review`.

Read first, write only on a real transition — re-setting the same status
every seven minutes is noise in the board's activity feed, and a quiet poll
is supposed to be quiet:

```bash
CUR=$(<gh-board-dir>/scripts/board.sh get-field "$PR_ITEM" Status)
[ "$CUR" = "<state>" ] || <gh-board-dir>/scripts/board.sh status "$PR_ITEM" "<state>"
```

Learn the board's real option names once per run (the `field-list` command
in `gh-board`) rather than guessing — a board with no `Changes Requested`
gets `In Progress` instead. An unknown option only warns and exits 0, so a
wrong guess costs a no-op rather than a crash, but it also means the board
silently stops reflecting reality.

### 6. Approval check → merge

Merge when **all three** hold:

- `reviewDecision` is `APPROVED`;
- the work queue is empty;
- `gh pr checks <N>` is green. **Red checks block the merge and go to
  the user** — fixing CI is out of this loop's scope; never auto-fix or
  merge around a failing check.

Pick the merge method from repo settings (`gh repo view --json
squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed`) — prefer
squash when allowed — and merge with branch cleanup:

```bash
gh pr merge <N> --squash --delete-branch
```

If the base branch has moved and there's a conflict, attempt a clean
update (merge the base into the PR branch, or `gh pr update-branch`); if
the conflicts need judgment, escalate to the user instead of resolving
creatively.

## After the merge — close-out and disarm

1. **Invoke `ship-pr`** and run its close-out step: the final "what
   shipped" comment on the PR (including anything that changed during
   review — this loop is usually why something changed) and the short
   resolution comment on the issue. `ship-pr` owns those formats;
   don't duplicate them here.
2. **Verify the board actually landed on Done — don't assume.** Most
   boards flip a merged PR and its closed issue to Done via built-in
   automation, and racing that automation is why the rest of the chain
   leaves the final flip alone. But an unconfigured board silently leaves
   both items stranded in `In Review` / `In Progress`, which is worse than
   a redundant write. So give automation a moment, then read the truth:

   ```bash
   ISSUE_ITEM=$(<gh-board-dir>/scripts/board.sh find <owner>/<repo> <issue-N>)
   <gh-board-dir>/scripts/board.sh get-field "$PR_ITEM" Status
   <gh-board-dir>/scripts/board.sh get-field "$ISSUE_ITEM" Status
   ```

   Still not Done after the close-out comments are posted → set it
   yourself, for **both** the PR item and the issue's item (they're
   separate items, per `gh-board`). Mention in the wrap-up that the board
   needed a manual flip — that's a sign the board's "Item closed → Done"
   automation isn't enabled, worth fixing once at the board level rather
   than papering over every merge.
3. **Clean up the local checkout.** The merge is done and the remote branch
   is gone, but the machine is still sitting on a dead branch — and possibly
   an isolated worktree from `work-issue` — which is how the next task starts
   from the wrong base. Cleanup is **destructive, so every step is guarded in
   code** rather than trusted to prose:

   ```bash
   <this-skill-dir>/scripts/cleanup.sh check <branch>       # dry run: see what's safe
   <this-skill-dir>/scripts/cleanup.sh all <branch> [worktree-path]
   ```

   `all` runs check → remove worktree → delete branch → return to an
   up-to-date default branch, in that order (the branch can't be deleted
   while a worktree holds it). Run it from the **main repo, not from inside
   the worktree being removed** — git refuses to remove the tree you're
   standing in. If `work-issue` used `EnterWorktree`, leave it via
   `ExitWorktree` first, then pass the worktree path.

   Each guard protects work that exists nowhere else: uncommitted changes,
   stashes, and commits whose patches aren't upstream yet. The unpushed check
   is patch-based (`git cherry`), not reachability-based, precisely because a
   squash merge — the default merge here — leaves the branch tip unreachable
   from the default branch while its content is safely merged; a reachability
   test would refuse to delete any squashed branch, ever.

   **A tripped guard prints `SKIPPED: <reason>` and exits 0.** That is a
   correct outcome to relay to the user, not an error to retry and never
   something to force past with `git worktree remove --force` or a manual
   `rm -rf`. If cleanup skipped something, the merge still succeeded — say
   what was kept and why, and let the user decide.

4. **Drop this PR's scratch artifacts** — the authored bodies, reply files
   and media that were only ever inputs to GitHub:

   ```bash
   <this-skill-dir>/scripts/cleanup.sh scratch <scratchpad-dir> 'pr-<N>-*.md' 'issue-<N>-*.md'
   ```

   The `scratch` command refuses any path that isn't a scratchpad/tmp
   directory, so a mistyped argument can't become a recursive delete
   somewhere real. Never point it at the repo.

5. **Disarm the cron** (`CronDelete`).
6. **Slack follow-up**, if a channel is configured: one line in the
   review channel so the announcement thread gets its ending, using
   Slack link markup (`<url|text>`, never a bare URL):
   `:white_check_mark: Merged: <PR URL|PR title> — closes <issue URL|#N>.`
   Skip silently if no Slack MCP or channel.
7. **Terse wrap-up to the user**: merged PR URL, how many review items
   were addressed across how many cycles, close-out posted, board status
   of PR + issue, what cleanup removed (worktree, branch, now on an
   up-to-date default branch) **and anything a guard held back**, cron
   disarmed.

## Division of labor

Same doctrine as the rest of the chain (see `work-issue`): the main agent
authors all content — replies, code, the Slack line — and makes every
classification call; subagents perform GitHub mechanics (posting replies,
fetching comment dumps). Delegated prompts mark every noun as *given* or
*to-produce* ("this file already exists and is final — do NOT create,
edit, or overwrite it"), authored files get unique names
(`pr-<N>-reply-<comment-id>.md`), and after any subagent posts to GitHub
or Slack, fetch what was actually published and compare it to what you
authored before moving on — exit codes lie, content doesn't.

## Failure modes

- **PR closed without merging** — disarm, tell the user, stop. Not our
  call to reopen.
- **Session died / cron expired mid-review** — nothing is lost; the
  stateless queue rebuild makes the next `/pr-review-loop #<N>` identical
  to a normal cycle. Say this to the user when arming, so they know the
  recovery is one command.
- **Reviewer pushes back on a fix** — that's just the thread becoming
  pending again (their word is last). The loop iterates; no special case.
- **Red checks at merge time** — hold the merge, report exactly what's
  failing, wait for the user. The approval doesn't expire; the loop keeps
  polling meanwhile.
- **Board item never reaches Done after merge** — the board's close
  automation isn't enabled. Set both items manually (see close-out) and
  tell the user, so they can fix it at the board level once.
- **Board lacks a `Changes Requested` option** — expected on simpler
  boards; fall back to `In Progress`, or leave the item at `In Review` if
  neither exists. `set-field` warns and exits 0, so this never breaks a
  cycle.
- **Ambiguous feedback** — clarified on-thread and surfaced in-session
  (see classification); the loop keeps handling other items while that
  thread waits on the reviewer.
- **Cleanup guard trips (dirty tree, stash, unpushed commits)** — working as
  designed. The worktree or branch is kept, `cleanup.sh` exits 0, and the
  wrap-up says what was held back and why. Never force past it; the user
  decides what happens to work that exists only on their machine.
- **`cleanup.sh` can't remove the worktree** — usually because it's being run
  from inside that worktree. `ExitWorktree` (or `cd` to the main repo) and
  re-run; don't reach for `--force`.
- **Local default branch has diverged** — `cleanup.sh main` pulls
  `--ff-only`, so it reports the divergence and leaves the branch alone
  rather than creating a merge commit during cleanup. Tell the user; it's
  theirs to reconcile.
- **The PR was reviewed by us, not authored by us** — wrong skill. Use
  `pr-review-watch`, which reviews and submits verdicts instead of
  implementing and merging.
