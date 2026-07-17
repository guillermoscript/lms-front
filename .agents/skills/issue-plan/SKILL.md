---
name: issue-plan
description: Read a GitHub issue and produce a posted plan of attack — gather the issue with its comments and references, survey the code it touches (read-only), author a short plan (root cause, approach, risks, test plan), then assign the issue, move it to In Progress on the board (if configured), and post the plan as the issue comment teammates read. Use when the user asks to "plan this issue", "read #123 and make a plan", "what's the approach for this issue", "just plan it, don't code it", or as the read-and-plan phase of a full issue workflow.
---

# Issue Plan — from issue URL to a posted plan of attack

The output of this skill is a **plan someone else could execute**: the issue
comment is the public record of the approach, and it later seeds the PR
body. Write it for the teammates who will read it on GitHub, not for the
user in this chat. No code gets written or changed here — this skill is
read-only on the codebase and write-only on the issue.

Repo facts (repo, gh user, board config) come from the **`gh-repo-config`**
skill; board moves go through **`gh-board`**. Neither being configured
blocks a plan — unconfigured pieces are skipped and noted.

## 1. Read the issue

Accept a full URL, `#N`, or a bare number. Gather everything in one pass:

```bash
gh issue view <N> --json number,title,body,labels,milestone,assignees,comments,url
```

Read the comments too — later comments often amend or overrule the original
body. If the issue references other issues/PRs (an epic parent, a "relates
to"), skim those for constraints. If the issue is genuinely ambiguous about
*what* to build (not *how* — that's this skill's job), ask the user before
going further.

If the issue is already assigned to someone else or already In Progress on
the board, stop and ask the user before taking it over.

## 2. Survey the code

Before forming an opinion, survey the code the issue touches — read-only;
Explore subagents are good for this. Check the repo's `CLAUDE.md`/`AGENTS.md`
for documented gotchas (multi-tenancy, auth boundaries, basePath quirks,
dual databases, feature flags — whatever that repo calls out). The posture
is survey-first: the plan must be written well enough that someone with
zero session context could follow it.

## 3. Author the plan

A short plan, four parts:

- **Root cause / current behavior** — what the code does today and why
  that's the issue.
- **Approach** — what will change, in which files.
- **Risks / blast radius** — what else touches this code, weighing the
  gotchas found in the survey.
- **Test plan** — which checks will prove it works (commands + manual
  steps), using the repo's discovered build/lint/test commands.

Write it to a uniquely-named file (`issue-<N>-plan.md`, never `plan.md`).
When implementation follows in the same session, this plan is also the seed
of the eventual PR body — write it once, well.

**If the issue touches anything visible** and implementation will follow,
invoke **`ui-evidence`** now — its before-captures must happen while the
code is still untouched; the "before" state stops existing the moment
implementation starts.

## 4. Post it (delegated housekeeping)

Spawn one subagent to do the GitHub bookkeeping — when implementation
follows, don't block on it; start implementing while it runs. Give it the
issue number, issue URL, the resolved GitHub username, the plan file path,
and (if a board is configured) the `gh-board` script path and board
owner/number, to run:

```bash
gh issue edit <N> --add-assignee <resolved-gh-user>
# if board configured — find-or-add the issue, then:
board.sh status "$ITEM" "In Progress"   # see gh-board for the full recipe
gh issue comment <N> --body-file <issue-<N>-plan.md>
```

The comment should open with a one-line note that an AI agent is picking
this up, then the plan. Keep it factual and skimmable (headers, short
bullets) — it's how teammates see the issue being attacked.

Two delegation rules keep the posted plan honest — a subagent that can't
find the plan file will fabricate a fluent replacement, and every signal
except the content itself will report success:

- **Mark the plan file as given.** The prompt must say: "This file already
  exists and is final — do NOT create, edit, or overwrite it; only pass its
  path to the command." Anything unmarked, the subagent resolves by
  improvising.
- **Verify content, not exit codes.** When the subagent reports back, fetch
  the posted comment body
  (`gh api repos/<owner>/<repo>/issues/comments/<id> -q .body`) and check
  it matches the plan you authored before moving on or reporting done.

**Standalone judgment call**: assigning, board moves, and the comment are
the default when this runs as part of a full issue workflow. If the user
asked only for a plan or an assessment ("what's the approach here?"),
deliver the plan in chat and ask before mutating the issue — posting and
self-assigning would overstep a read-only request.

## Failure modes

- **No project board** — expected in many repos; skip the board move and
  say so. Not a failure.
- **Issue assigned to someone else / already In Progress** — stop and ask
  the user before taking it over.
- **The posted comment doesn't match what you authored** — the subagent
  improvised. Fix it in place with
  `gh api -X PATCH .../issues/comments/<id> -f body=@<file>` rather than
  delete-and-repost — editing keeps the comment's thread position. Write
  the corrected content to a **new, uniquely-named file** first, so you're
  not racing whatever clobbered the original.
- **Plan invalidated later** (implementation reveals it was wrong) — post a
  short follow-up comment on the issue correcting the record; don't leave a
  stale plan as the last word.
