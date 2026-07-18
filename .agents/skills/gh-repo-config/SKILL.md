---
name: gh-repo-config
description: Discover the current repo's GitHub-workflow facts — repo name, authenticated gh user, project board, PR template, Slack channel, branch/commit conventions, build/test commands — and cache the non-discoverable ones in <repo-root>/.claude/gh-workflow.config.json so they're asked at most once per repo. Use at the start of any GitHub workflow (work-issue, ship-pr, gh-board rely on it), or when the user asks "what conventions does this repo use", wants to change a saved board/Slack/reviewer setting, or a workflow skill needs a config value it doesn't have.
---

# GH Repo Config — resolve repo facts once, reuse forever

Two kinds of facts feed a GitHub workflow: those discoverable from the repo
and API at runtime (discover fresh, never cache) and those that aren't —
which project board, which Slack channel, who reviews (ask **once**, cache in
the config file, never ask again). The bundled `scripts/config.sh` manages
the cache; invoke it by this skill's own path, `<skill-dir>/scripts/config.sh`.

## The config file

`<repo-root>/.claude/gh-workflow.config.json` — created on first use,
committed or gitignored at the user's discretion (tell them where it is so
they can choose). Example shape; every field is optional and repo-specific:

```json
{
  "projectBoard": { "owner": "<github-org-or-user>", "number": 1 },
  "slackChannel": "#pr-review",
  "slackChannelId": "C0123456789",
  "defaultReviewer": { "name": "Alex", "slackId": "U0123456789" },
  "prTemplate": ".github/pull_request_template.md",
  "branchConvention": "<type>/<N>-<slug>"
}
```

Key ownership — which skill consumes what:

| Key | Consumer |
|---|---|
| `projectBoard` | `gh-board` |
| `slackChannel`, `slackChannelId`, `defaultReviewer` | `ship-pr` |
| `prTemplate` | `ship-pr` |
| `branchConvention` | `work-issue` (branching) |

`config.sh` commands:

```
config.sh path         Print the config file path (may not exist yet)
config.sh read         Print the JSON, or "{}" if none
config.sh get <jq>     One value, e.g. config.sh get .projectBoard.number
config.sh init         Create it if missing (auto-migrates a legacy
                       work-issue.config.json if one exists)
```

Rules:

- **If the file already has a value, trust it** — don't re-ask or re-detect.
  If the user says a saved value is wrong mid-run, update the file
  immediately.
- **Batch the questions.** When several values are missing, ask about them
  in one AskUserQuestion call up front, not one at a time deep into a run.
- **Write back whatever was resolved** (asked or inferred) with
  `config.sh init` + editing the JSON, and tell the user you saved it and
  where.
- **Missing config is not an error.** An unconfigured feature (no board, no
  Slack) means the consuming skill skips that feature and says so.

## Discovery procedure

Run whichever of these the calling workflow needs:

1. **Repo.** `gh repo view --json nameWithOwner,url -q .nameWithOwner` from
   the cwd — `gh` resolves this from the git remote, so it works in any repo
   without configuration. If it fails (not a git repo, no `gh` auth), stop
   and tell the user; nothing downstream can work.
2. **GitHub user.** `gh api user -q .login` — the currently authenticated
   `gh` user. Never hardcode a username.
3. **Project board** (if not in config): try
   `gh project list --owner <org-from-repo> --format json` — if exactly one
   open project references this repo, propose it instead of asking blind.
   If none/ambiguous, ask whether to use a board at all, and if so which
   owner/number.
4. **PR template**: check `.github/pull_request_template.md` and
   `.github/PULL_REQUEST_TEMPLATE.md` directly — detect, don't ask. If
   absent, note that PRs will be free-form.
5. **Slack**: check for a connected Slack MCP (ToolSearch for `slack`
   tools). If found, ask which channel and (optionally) a default reviewer
   to `@mention`. If no Slack MCP is connected at all, skip silently —
   don't ask about a channel for a tool that isn't there.
6. **Branch/commit convention**: read recent branch names
   (`git branch -r | tail -20`) and `git log --oneline -20` to infer the
   pattern rather than asking — most repos are consistent enough to
   reverse-engineer. Fall back to `<type>/<N>-<slug>` branches and
   Conventional Commits if history is sparse or inconsistent.
7. **Repo command conventions**: look for `CLAUDE.md` / `AGENTS.md` at the
   repo root — most repos maintained with Claude Code have one describing
   lint/test/build/typecheck commands, directory layout, and gotchas. If
   present, read and follow it. If absent, infer commands from
   `package.json` scripts (or the language's equivalent) before running
   anything. These are session facts, not config-file material — rediscover
   per session.
