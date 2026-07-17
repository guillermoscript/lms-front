# Plan 005: Add a CI verification workflow and pre-commit hooks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e58974fb..HEAD -- .github/workflows package.json`
> If a `.github/workflows/ci.yml` already exists, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (adds gates; does not change app code)
- **Depends on**: plans/002 (CI calls `npm run typecheck` and `npm run test:unit`, both added by 002)
- **Category**: dx
- **Planned at**: commit `e58974fb`, 2026-06-15

## Why this matters

The only GitHub Actions workflows are `deploy.yml` (builds the Docker image and triggers Dokploy on push to `master`) and `deploy-mcp.yml`. **Nothing runs lint, typecheck, or tests on a pull request** — a PR can introduce type errors, lint failures, or broken unit tests and only be caught when the deploy build fails on `master` (after merge). There are also no pre-commit hooks, so the same problems reach the remote routinely. This plan adds a CI workflow that gates PRs on lint + typecheck + unit tests, and lightweight pre-commit hooks so contributors catch issues before pushing. E2E (Playwright) is intentionally **not** added to CI here because it needs a running app and a seeded Supabase instance (out of scope for a fast PR gate).

## Current state

- `.github/workflows/deploy.yml` — deploy-only, triggers on `push: branches: ["master"]`; no test/lint/typecheck steps.
- `.github/workflows/deploy-mcp.yml` — MCP server deploy.
- `package.json` after plan 002 has: `lint` (`eslint`), `typecheck` (`tsc --noEmit`), `test:unit` (`vitest run`), `test` (`npx playwright test`).
- npm workspace repo (`package-lock.json` present) → use `npm ci` in CI.
- No `husky` / `lint-staged` in any manifest.
- Node: devDependency `@types/node: "^20"`; use Node 20 in CI to match.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm ci`               | exit 0              |
| Lint      | `npm run lint`         | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0              |
| Unit tests| `npm run test:unit`    | exit 0              |

## Scope

**In scope** (create or modify only these):
- `.github/workflows/ci.yml` (create)
- `package.json` (add `prepare` script + `lint-staged` config + husky/lint-staged devDeps)
- `.husky/pre-commit` (create, via husky)
- `package-lock.json` (changes from install — expected)

**Out of scope** (do NOT touch):
- `.github/workflows/deploy.yml` and `deploy-mcp.yml` — leave deploy untouched.
- Do NOT add Playwright/E2E to CI.
- Do NOT change any app source, eslint config, or tsconfig.

## Git workflow

- Branch: `advisor/005-ci-and-precommit`
- One commit: `chore(dx): add CI lint/typecheck/test gates and pre-commit hooks`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm plan 002 landed

**Verify**: `npm run typecheck` and `npm run test:unit` both exist and exit 0. If either script is missing, STOP — plan 002 is a prerequisite.

### Step 2: Create the CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore: ["master"]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Typecheck
        run: npm run typecheck
      - name: Unit tests
        run: npm run test:unit
```

(`push: branches-ignore: ["master"]` avoids double-running with `deploy.yml` on master while still gating feature branches.)

**Verify**: the file is valid YAML — `npx --yes js-yaml .github/workflows/ci.yml >/dev/null` exits 0 (or any YAML linter you have). If `js-yaml` is unavailable, visually confirm indentation.

### Step 3: Install and initialize husky + lint-staged

Run: `npm install -D husky lint-staged`
Then: `npx husky init` (creates `.husky/` and adds a `prepare` script).

**Verify**: `.husky/pre-commit` exists and `package.json` has `"prepare": "husky"`.

### Step 4: Configure lint-staged and the pre-commit hook

Add to `package.json` (top level):

```json
"lint-staged": {
  "*.{ts,tsx}": "eslint --fix"
}
```

Replace the contents of `.husky/pre-commit` with:

```sh
npx lint-staged
```

(Keep the hook fast — lint-staged on staged files only. Do NOT run full typecheck/test in the hook; that is the CI job's role. Typecheck on every commit would be too slow for this 112K-LOC repo.)

**Verify**: stage a trivial whitespace change to any `.ts` file and run `git commit -m "test"` in a throwaway way? **Do NOT actually commit app changes.** Instead verify the hook is wired: `cat .husky/pre-commit` shows `npx lint-staged`, and `npx lint-staged --help` runs.

### Step 5: Final verification

**Verify**: `npm run lint && npm run typecheck && npm run test:unit` → all exit 0.

## Test plan

No application tests are added by this plan. Verification is that the CI workflow file is valid and the hooks are wired (see step verifications). The real proof is the next PR running the `verify` job — note that in the PR description for the reviewer.

## Done criteria

ALL must hold:

- [ ] `.github/workflows/ci.yml` exists and runs `npm ci`, lint, typecheck, test:unit
- [ ] `package.json` has `prepare: "husky"`, a `lint-staged` block, and `husky` + `lint-staged` devDeps
- [ ] `.husky/pre-commit` runs `npx lint-staged`
- [ ] `npm run lint && npm run typecheck && npm run test:unit` exit 0 locally
- [ ] `deploy.yml` is unchanged (`git diff --stat e58974fb..HEAD -- .github/workflows/deploy.yml` empty)
- [ ] No app source modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Plan 002's `typecheck` or `test:unit` scripts are missing (prerequisite not met).
- `npx husky init` overwrites or conflicts with existing `prepare` script content — report what was there.
- `npm run lint` or `npm run typecheck` fails on the unmodified codebase (a red baseline must be fixed first; escalate it).

## Maintenance notes

- For the reviewer: confirm CI does NOT run Playwright (would need Supabase) and that the pre-commit hook is lint-only (kept fast).
- Follow-up deferred: a separate scheduled/e2e workflow that spins up Supabase and runs `tests/playwright/` is valuable but is its own plan (needs service containers + seed).
- If the team later wants typecheck in the hook, measure `tsc --noEmit` wall-time first; on this repo size it is likely too slow for every commit.
