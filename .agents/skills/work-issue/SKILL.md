---
name: work-issue
description: End-to-end GitHub issue workflow, repo-agnostic — read an issue, plan it, move it to In Progress on the project board (if one exists), implement it with efficient-fable orchestration, verify UI changes with a recorded GIF, open a template-compliant PR set to In Review with labels and milestone, and announce it on Slack for review (if connected). Supports extra skills as +args (e.g. "/work-issue <url> +shadcn +animate"). Use whenever the user pastes a GitHub issue URL or issue number and wants it worked on — "work on this issue", "pick up #123", "start this one", "ship this issue", "take https://github.com/.../issues/N" — even if they don't name the skill.
---

# Work Issue — issue URL to reviewed PR

Automates the full issue-to-PR pipeline for whatever GitHub repo the current
working directory belongs to. The user pastes an issue URL (or number); you
deliver a merged-ready PR with the project board, labels, milestone, and QA
record all handled. Every step exists because a human reviewer or QA person
consumes its output later — the issue comment is the public record of the
approach, the PR body is the QA script, the GIF is the visual proof. Write
those artifacts for *them*, not for the user in this chat.

This skill is the **orchestrator**: it owns the pipeline order, the
implementation (the only phase no companion covers), and the wrap-up. The
rest lives in five companion skills, each also usable standalone — invoke
them via the Skill tool at the step that needs them, and follow their rules
rather than restating them here:

| Skill | Owns | Used at |
|---|---|---|
| `gh-repo-config` | Repo facts, conventions, `.claude/gh-workflow.config.json` | Step 0 |
| `issue-plan` | Read issue → survey → plan → assign + In Progress + plan comment | Step 2 |
| `gh-board` | All GitHub Projects (v2) operations (`board.sh`) | via `issue-plan`/`ship-pr` |
| `ui-evidence` | Before/after screenshots, GIF recording, PR media upload | Steps 2, 4, 6 |
| `ship-pr` | PR body, draft→ready lifecycle, metadata, Slack announcement, post-merge close-out | Steps 5–7 + close-out |

## Invocation and +skill params

The argument is the issue (URL, `#N`, or bare number), optionally followed by
extra skills prefixed with `+`:

```
/work-issue https://github.com/<owner>/<repo>/issues/302
/work-issue #302 +shadcn +animate
/work-issue 302 +systematic-debugging
```

Each `+name` is a skill to load in Step 1 **in addition to** the defaults.
This is the extension point: the user will keep adding skills to their
toolbox over time, so treat the list as open-ended. If a `+name` doesn't
match any available skill, say so briefly and continue without it — a typo
shouldn't sink the run.

### Worktree isolation — ask, don't assume

Before branching, ask the user (AskUserQuestion, one question) whether to run
in an isolated git worktree or directly in the working tree. Recommend
isolation when `git status` shows uncommitted changes — the pipeline creates
branches and commits, and doing that in a dirty tree risks tangling their
in-flight work. If they choose isolation, use EnterWorktree and run the whole
pipeline there; the working tree they were looking at never changes. If
they've answered before in this session or said "always isolate"/"never
ask", respect that instead of re-asking.

### Parallel mode — multiple issues

If the user passes more than one issue (`/work-issue #302 #305 #310`), run
each through the full pipeline in its own subagent with
`isolation: "worktree"` — isolation is not optional here, since parallel runs
would otherwise fight over branches and the working tree. Spawn the agents in
one message so they run concurrently, give each the full skill path and its
issue, and relay each PR URL as it lands. Anything that needs the shared
Chrome browser (see `ui-evidence`) serializes badly across parallel agents —
have each agent finish its PR and leave UI verification queued, then do the
Chrome-dependent steps yourself, one PR at a time, at the end.

## Division of labor — the main agent writes code, subagents do bookkeeping

The main agent's context is the scarcest resource in the run, and it should
be spent on the code: understanding, implementing, judging. Every
GitHub-mechanical action — issue comments, assignments, PR creation, labels,
milestones, board moves, Slack posts — is delegated to subagents. The split
is by *kind of work*, not by step:

- **Main agent authors content**: the plan text, the PR body, comment text,
  the Slack message. These need full session context and judgment.
- **Subagents perform mechanics**: they receive that content plus exact
  commands and run them, returning only what the main agent needs next (a PR
  URL, an item ID). They need no session context beyond what's in the prompt.
- **The one exception is Chrome** (screenshots, GIF recording, media
  upload): the browser is a single shared resource, so the main agent drives
  it directly — `ui-evidence` states this rule and it always wins.

### Delegation guardrail — authored content must survive the subagent

Delegation has a failure mode that looks like success: a subagent that
can't find (or misreads) an authored file will fabricate a fluent
replacement, write it over the original in the shared scratchpad, and post
it — and every signal except the content itself reports success ("comment
posted ✓" is true). On a public record like GitHub, that's teammates being
actively misled. Three rules make it a non-event:

- **Prevention — mark every noun.** In a delegated prompt, every file and
  value is either *given* or *to-produce*. For every given file, include
  this sentence: "This file already exists and is final — do NOT create,
  edit, or overwrite it; only pass its path to the command." Cheap models
  improvise when a prompt is ambiguous about whether an artifact exists;
  anything unmarked, the subagent resolves by improvising.
- **Detection — verify content, not exit codes.** After a subagent posts to
  any external surface (issue comment, PR body, Slack), fetch what was
  actually posted (e.g. `gh api .../comments/<id> -q .body`) and compare it
  against what you authored, before building on it or reporting it done.
- **Damage control — unique names.** Name authored files uniquely
  (`issue-<N>-plan.md`, never `plan.md`) so a stray write is detectable
  instead of plausible, and never reuse a clobbered file — recover into a
  fresh name.

`issue-plan` and `ship-pr` apply these rules at their own posting steps and
document the in-place recovery (`gh api -X PATCH` / `gh pr edit`); this
section is the doctrine that also covers any *other* delegation the run
invents.

## Pipeline

```
0. Resolve repo + config (gh-repo-config)  →  1. Load skills
→  2. Read + plan + housekeeping (issue-plan; before-shots via ui-evidence if UI)
→  3. Branch + implement  →  4. Verify (+ GIF via ui-evidence if UI)
→  5. Draft PR + board (ship-pr)  →  6. Post media (ui-evidence)
→  7. Mark ready + Slack (ship-pr)
```

### Step 0 — Resolve repo facts and per-repo config

Invoke **`gh-repo-config`** and follow its discovery procedure. Before
moving on you need: the repo (`nameWithOwner`), the authenticated gh user,
board/Slack/template config (or the knowledge that they're unconfigured),
the branch/commit convention, and the repo's build/lint/test commands
(`CLAUDE.md`/`AGENTS.md` or inferred). Batch any questions for the user
right after reading the issue, not one at a time deep into the run. If the
repo itself can't be resolved (not a git repo, no `gh` auth), stop and tell
the user.

### Step 1 — Load the companion skills

Invoke via the Skill tool. Always load:

1. **`caveman`** — terse chat output for the session. Scope it: caveman
   applies to *conversation with the user only*. Everything written to
   GitHub or Slack (issue comments, PR body, commit messages, review
   announcements) is a permanent record read by other people — write those
   in normal, professional, full-sentence English.
2. **`efficient-fable`** — orchestration mode: you architect and judge;
   cheap subagents do bounded research/coding/testing legwork.

Conditionally load, once Step 2 reveals the issue is frontend work (a
`frontend`/`UI`/`UX` label, or the plan touches UI component/page files) —
these two can wait until then:

3. **`vercel-react-best-practices`** — React/Next.js performance patterns
   (skip if the repo isn't React/Next.js).
4. **`vercel-composition-patterns`** — component API and composition design
   (skip if the repo isn't React/Next.js).

Then load every `+skill` passed in the invocation (see "Invocation and
+skill params" above). When a loaded skill only applies to a sub-phase (e.g.
a design skill matters during implementation, not planning), apply it where
it fits rather than forcing it everywhere.

Do **not** invoke the full `improve` skill (it's a read-only advisor that
writes plan files under `plans/` and never implements). Instead, borrow its
posture for the planning phase: survey first, read-only, and write the plan
well enough that someone with zero session context could follow it.

### Step 2 — Read, plan, and housekeeping (issue-plan)

Invoke **`issue-plan`** and follow it end to end: it reads the issue (with
comments and referenced issues), stops if the issue is ambiguous or already
someone else's, surveys the code read-only, authors the four-part plan
(root cause, approach, risks, test plan), and spawns the housekeeping
subagent (assign + board In Progress + plan comment) with the delegation
guardrail applied. In this pipeline the housekeeping runs in the
background — don't block on it; start Step 3 while it posts, then check its
content verification before Step 5.

Its plan is a load-bearing artifact for the rest of the run: it seeds the
PR body in Step 5, and its test plan is the checklist for Steps 3–4. If the
issue touches UI, `issue-plan` triggers `ui-evidence`'s before-captures —
that must happen before any code changes in Step 3.

### Step 3 — Branch and implement

Branch from up-to-date default branch (`gh repo view --json defaultBranchRef
-q .defaultBranchRef.name`), following the convention resolved in Step 0
(e.g. `fix/292-status-filter-options`, `feat/293-request-intake-module`).
Pick `type` from the issue's nature: `feat`, `fix`, `chore`, `refactor`,
`docs`.

Implement per the plan, using efficient-fable orchestration. Use the
commands and per-directory conventions discovered in Step 0 — lint,
typecheck, test, build. If the tree has pre-existing lint/type errors
unrelated to your change, judge your diff by *new* errors on *changed files*
only, and say so in the PR. Follow the commit message convention from Step
0, and end commits with the Co-Authored-By trailer.

Run the relevant checks before moving on; if the repo has a pre-push hook
(check `.githooks/` or `core.hooksPath` in git config) it'll typecheck/lint
anyway — failures are cheaper to catch now than at push time.

### Step 4 — Verify (GIF required for UI changes)

Decide: did this change anything a user can see or click? If yes, this step
is **mandatory**: invoke the **`verify`** skill to exercise the changed flow
end-to-end in the running app, and record it per **`ui-evidence`** (GIF +
matching "after" screenshots of the screens captured during Step 2's
before-shots).

For backend-only changes, `verify` at your judgment (run the integration
tests, exercise the endpoint), and skip the GIF.

### Steps 5–7 — Ship the PR

Push the branch, then invoke **`ship-pr`** and follow it end to end. The
main agent authors the PR body (seeded from the Step 2 plan) and decides
the metadata; subagents do the creation, labels, milestone, and board moves;
for UI changes, `ui-evidence` posts the before/after shots and GIF as a PR
comment (Step 6) **before** the PR graduates from draft. `ship-pr` owns the
ready gate and the Slack announcement — respect its rule that only a
genuinely reviewable PR gets flipped and announced.

## Wrap-up report to the user

End with a terse (caveman-compliant) summary: PR URL, board status of issue +
PR (if a board is configured), checks run and their results, whether the GIF
was posted, whether Slack was notified, and anything that needs their eyes —
especially the visual verification if it was a UI change. Remind them that
when the PR is approved and merged, saying so ("it's merged") triggers the
close-out below.

## Close-out — after approval and merge

The pipeline's coda, usually in a later session once a human has approved
and merged the PR. When the user says the PR merged (or you observe it),
invoke **`ship-pr`** and follow its close-out step: a final comment on the
PR recording the work as actually shipped, and a short comment on the issue
referencing the PR — so both permanent records end with a simple summary of
how the issue was closed.

## Failure modes

- **No project board, no PR template, no Slack** — expected in a lot of
  repos. Skip those steps and say so in the wrap-up; this is not a failure.
- **Plan invalidated mid-implementation** — `issue-plan` owns the record:
  post a short follow-up comment on the issue correcting it; don't leave a
  stale plan as the last word.
- **Checks fail and the fix isn't obvious** — report honestly in the PR (or
  hold the PR and ask the user). Never check a Testing box that didn't
  actually pass.
- **Companion mechanics fail** — `issue-plan` (contested issue, posted
  comment drifted from the authored plan), `gh-board`, and `ui-evidence`
  each document their own failure modes and recoveries; follow those, and
  surface in the wrap-up anything that ended up skipped or degraded.
