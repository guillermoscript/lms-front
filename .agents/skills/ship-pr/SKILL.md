---
name: ship-pr
description: Take an implemented branch to a reviewable pull request — author a template-compliant PR body with a QA script, open it as a draft with labels/milestone/assignee mirrored from the issue, link it to the project board, flip it to ready only when it's genuinely reviewable, announce it on Slack with a reviewer mention (if Slack is connected), and post the final close-out comments on the PR and its issue once it's approved and merged. Use when the user asks to "open a PR for this branch", "ship this", "mark the PR ready", "announce this PR on Slack", or says a PR was merged and wants it closed out ("it's merged", "close out #N"), or as the closing phase of an issue workflow.
---

# Ship PR — from pushed branch to announced, reviewable PR

The PR body is the QA script and the announcement is what actually gets the
work reviewed — write both for the teammates who consume them, not for the
user in this chat. Everything GitHub or Slack sees is a permanent record:
normal, professional, full-sentence English.

Config (PR template path, Slack channel, default reviewer) comes from
`.claude/gh-workflow.config.json` — resolve missing pieces via the
**`gh-repo-config`** skill. Board operations go through the **`gh-board`**
skill. Neither being configured blocks a PR; unconfigured features are
skipped and noted.

## Division of labor

The main agent does exactly two kinds of work here: **author content** (the
PR title + body, the Slack message — these need session context and
judgment) and **decide metadata** (labels, milestone, size — deciding takes
judgment, applying doesn't). Every mechanical action — creating the PR,
applying labels/milestone/assignee, board moves, the Slack post — goes to a
subagent that receives the authored content plus exact commands and returns
only what's needed next (PR URL, board item id).

Two rules keep that delegation honest — a subagent that can't find an
authored file will fabricate a fluent replacement, and every signal except
the content itself will report success:

- **Mark every noun in the prompt.** Each file or text is *given* or
  *to-produce*. For every given file: "This file already exists and is
  final — do NOT create, edit, or overwrite it; only pass its path to the
  command." Authored text travels with "post this EXACTLY, verbatim". Name
  authored files uniquely (`pr-<N>-body.md`, not `body.md`) so a stray
  write is detectable.
- **Verify content, not exit codes.** After the subagent runs, fetch what
  was actually published (`gh pr view <PR> --json title,body`, the posted
  comment via `gh api .../comments/<id> -q .body`, the Slack message) and
  compare it to what you authored. If it drifted, edit in place —
  `gh pr edit` / `gh api -X PATCH` keeps thread position, unlike
  delete-and-repost — using corrected content written to a **fresh,
  uniquely-named file**, not the possibly-clobbered original.

## 1. Author the PR body

Write the title and body to a file before anything is created. If the repo
has a PR template (config key `prTemplate`, or detect
`.github/pull_request_template.md` / `.github/PULL_REQUEST_TEMPLATE.md`),
read it and fill **every** section rather than approximating from memory.
If no template exists, use this shape:

- **Description / Changes made** — from the implementation plan + what
  actually happened.
- **Type of change** — feature / fix / chore / refactor / docs.
- **Relationship** — `Closes #<N>` (this auto-closes the issue and links
  the board items, if a board is in play).
- **Labels & checklist** — check only boxes actually completed.
- **Testing** — this is the QA script. Two parts: checked boxes with the
  *exact commands run and their results*, and a **QA verification steps**
  list — numbered, concrete manual steps a QA person can follow without
  context. Never check a Testing box that didn't actually pass; if the tree
  had pre-existing failures unrelated to the change, say so here.
- **Screenshots (if UI change)** — note that before/after screenshots and
  the GIF follow as a comment (see the `ui-evidence` skill) if the repo is
  private; public repos can take direct `![]()` links in the body.

Title follows the repo's commit convention (config key
`branchConvention` / inferred), typically `type(#N): summary`.

## 2. Open as draft + board bookkeeping (delegated)

Draft is deliberate: "In Review" must mean *actually reviewable*, so the PR
stays a draft until checks pass and any visual evidence is posted. Decide
the metadata (labels mirrored from the issue, milestone, size estimate),
then spawn a subagent with the body file path, the metadata values, and the
`gh-board` script path, to run:

```bash
gh pr create --draft --title "<title>" --body-file <body.md>
gh pr edit <PR> --add-assignee <gh-user> \
  --add-label <issue's labels, comma-separated> \
  --milestone "<issue's milestone, if any>"
# if a board is configured (see gh-board for the env vars):
PR_ITEM=$(board.sh add <pr-url>)
board.sh status "$PR_ITEM" "In Progress"
board.sh priority "$PR_ITEM" <issue's P-label, if any>
board.sh size "$PR_ITEM" <XS/S/M/L/XL, decided by the main agent>
```

The subagent reports back the **PR URL and `PR_ITEM` id** — the next steps
need both. Before using them, verify the created PR's title and body match
what you authored (`gh pr view <PR> --json title,body`) — see the
delegation rules above. If the issue has no milestone, use the open sprint/milestone
whose date range contains today (`gh api repos/<owner>/<repo>/milestones`),
if the repo uses milestones at all. Leave the **issue's** board status at
In Progress — it flips to Done automatically when the PR merges.

## 3. The ready gate

Graduating from draft is a **decision, not a step**: flip only when checks
ran clean and, for UI changes, the verification media is posted. If
something is genuinely unresolved (a check you couldn't fix, verification
the user must do first), leave it a draft, leave the board at In Progress,
and say exactly what's blocking — a premature "ready" wastes a reviewer's
time and burns trust in the board. Only announce a PR that was actually
marked ready — never a draft.

## 4. Mark ready + announce (delegated)

Author the Slack message, then spawn a subagent with the PR number,
`PR_ITEM` (if any), the message — instructed to post it **EXACTLY,
verbatim** — and the channel, to run:

```bash
gh pr ready <PR>
# if board configured:
board.sh status "$PR_ITEM" "In Review"
```

then post to the configured review channel via the connected Slack MCP
(ToolSearch for `slack` message/post tools), and report back what
succeeded (ready flipped? board moved? Slack posted?).

Two things make an announcement land instead of sitting unaddressed:

- **It `@mentions` a reviewer**, if a default reviewer is configured. A
  post with no mention is easy to scroll past. Put the mention on its own
  leading line so it reads as a direct ask. If none is configured and the
  user hasn't named one, post without a mention rather than blocking, and
  say so afterwards.
- **Links use Slack's link markup**, `<https://url|link text>`, never a
  bare URL. Not just style: a bare URL immediately followed by more text on
  the next line has been observed to get merged by the send tool into one
  broken link (the literal newline and following word ended up inside the
  URL). One `<url|text>` per line avoids this, and distinct link texts keep
  multiple links (PR + issue) visually separate.

Message format — short, scannable, written for teammates:

```
<@reviewer-slack-id> — new PR ready for your review.

:rocket: <PR URL|PR title>
Closes <issue URL|#<N>> — <one-line summary of the change>
QA steps are in the PR body. <"Includes before/after screenshots and a verification GIF in the comments." if UI>
```

If no Slack MCP is connected or no channel is configured, skip the post and
hand the user the ready-to-paste message instead, noting that connecting a
Slack MCP (`claude mcp add`) and configuring a channel would automate this.

## 5. Close-out — after approval and merge

Approval and merge usually happen after the shipping session ends, so this
step fires whenever the merge becomes known: the user says so ("it's
merged", "close out #N"), or a later check shows it
(`gh pr view <PR> --json state,mergedAt` → `MERGED`). Never post close-out
comments on an unmerged PR — verify the state first.

The point is a final, simple summary in both permanent records, so anyone
landing on either page later gets the outcome in one comment without
reading the whole thread. The **full story lives on the PR; the issue gets
a pointer to it.** As usual, the main agent authors both comments; a
subagent posts them:

- **PR comment — the final work record.** What actually shipped, including
  anything that changed during review (the body was written before review
  feedback — this comment is where the final state gets stated). One short
  paragraph plus, if useful, a few bullets: final scope, checks/QA that
  passed, anything intentionally deferred with links to follow-up issues.
- **Issue comment — the reference.** One or two sentences: closed by
  `<PR link>`, one-line summary of the resolution, and that full details
  and the QA record are in the PR. The issue itself was auto-closed by
  `Closes #<N>` — this comment exists so the issue page ends with a
  human-readable resolution instead of a bare "closed by" event.

```bash
gh pr comment <PR> --body-file <closeout-pr.md>
gh issue comment <N> --body-file <closeout-issue.md>
```

No board action is needed — merge automation flips the items to Done. If
follow-up work surfaced during review, link the follow-up issues in both
comments rather than reopening anything.
