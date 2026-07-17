# Plan 007: Dependency hygiene — align Zod across workspaces and apply available security patches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e58974fb..HEAD -- package.json package-lock.json mcp-server/package.json`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (dependency bumps can break builds; verify after each)
- **Depends on**: none (but easier to trust if plan 002's typecheck exists)
- **Category**: dependencies
- **Planned at**: commit `e58974fb`, 2026-06-15

## Why this matters

Two low-but-real dependency issues. (1) **Zod version skew**: the root app pins `zod@^4.3.6` while the `mcp-server` workspace pins a different (older) major per the audit — divergent Zod majors across one repo cause subtle schema/type incompatibilities if any code or types are shared, and confuse contributors. (2) **Unapplied security patches**: `npm audit` reports advisories; the non-breaking, in-range patches should be applied so the app isn't shipping known-vulnerable transitive code unnecessarily. This plan does the **safe** part only — version alignment and in-range patch updates that `npm audit fix` (without `--force`) can apply — and explicitly defers risky major bumps (those are plan 008 for the Solana stack, and the audit already rejected the Stripe SDK major bump as not worth it).

## Current state

- Root `package.json:106` — `"zod": "^4.3.6"`.
- Root deps include `next: "16.1.6"`, `eslint-config-next: "16.1.6"` (pinned exact). React `19.2.4`. Stripe `^20.4.1` (do NOT bump — see Out of scope).
- `mcp-server/package.json` — has its own `zod` pin (read it; the audit flagged it as a different major from root). Note: `mcp-server` runs on `mcp-use`, which may constrain the allowed Zod major.
- npm workspace repo; `package-lock.json` at root.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Audit     | `npm audit`                      | prints advisory list |
| Audit (prod only) | `npm audit --omit=dev`   | runtime advisories  |
| Safe fix  | `npm audit fix`                  | applies in-range fixes |
| Install   | `npm install`                    | exit 0              |
| Build     | `npm run build`                  | exit 0              |
| Typecheck | `npm run typecheck` (if plan 002 landed) | exit 0      |
| Lint      | `npm run lint`                   | exit 0              |

## Scope

**In scope**:
- `package.json` / `package-lock.json` (root) — Zod alignment + safe audit fixes only
- `mcp-server/package.json` / `mcp-server/package-lock.json` — Zod alignment only
- No source code changes unless a patched dep requires a trivial, documented call-site adjustment (if so, STOP and report first)

**Out of scope** (do NOT touch):
- `stripe` (20.x → 22.x), `@stripe/stripe-js` (8.x → 9.x) — the audit reviewed these and they are NOT worth the major bump now (rejected findings DEP-05/DEP-06).
- `@solana/pay`, `@solana/spl-token`, `@solana/web3.js` — the Solana vuln chain is plan 008 (a spike, not a blind bump).
- `next` / `react` **major** changes. A `next` patch within `16.1.x` is allowed ONLY if `npm audit` shows a `next` advisory fixed by it AND `npm run build` still passes.
- Any `npm audit fix --force` — forbidden (it does major bumps).

## Git workflow

- Branch: `advisor/007-dependency-hygiene`
- Commit per logical unit (zod alignment; audit fixes): `chore(deps): align zod across workspaces`, `chore(deps): apply non-breaking npm audit fixes`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Record the baseline

Run `npm audit --omit=dev` and save the output to your report. Note the count of high/critical advisories and which are in runtime (non-dev) paths. This is the before-state.

**Verify**: command runs; you have captured the advisory list.

### Step 2: Align Zod across workspaces

Read `mcp-server/package.json`'s `zod` version. Determine whether `mcp-server` (via `mcp-use`) supports Zod 4.x:
- If yes: set `mcp-server`'s `zod` to match the root range (`^4.3.6`), run `npm install` in the repo root (workspaces install together), and rebuild the MCP server: `npm run mcp:build`.
- If `mcp-use` requires Zod 3.x (check its peer deps — `npm ls zod`): do NOT downgrade the root app. Instead, document the constraint in your report and leave the skew, adding a one-line comment in `mcp-server/package.json` is not possible (JSON), so note it in `mcp-server`'s README or your report. Treat "cannot align due to mcp-use peer constraint" as a successful, documented outcome — not a failure.

**Verify**: `npm ls zod` shows the resolution; if aligned, both report the same major. `npm run mcp:build` exits 0 (if you changed mcp-server).

### Step 3: Apply non-breaking audit fixes

Run `npm audit fix` (NOT `--force`). Review what changed in `package-lock.json`.

**Verify**: `npm run build` → exit 0. `npm run lint` → exit 0. If plan 002 landed: `npm run typecheck` → exit 0 and `npm run test:unit` → exit 0.

### Step 4: Optional Next patch (only if audit-driven)

If `npm audit` listed a `next` advisory with a fix available in the `16.1.x` line, bump `next` and `eslint-config-next` to that exact patch, `npm install`, and `npm run build`. If the bump breaks the build, revert it and report. Do not pursue a Next major/minor here.

**Verify**: `npm run build` → exit 0.

### Step 5: Record the result

Run `npm audit --omit=dev` again; compare advisory counts to Step 1 in your report (before/after).

## Test plan

- No new tests. Verification is `npm run build` + `npm run lint` (+ `typecheck`/`test:unit` if plan 002 landed) passing after each change, plus the before/after audit counts.
- If plan 006's unit tests exist, run `npm run test:unit` as an extra regression signal.

## Done criteria

ALL must hold:

- [ ] Zod is either aligned across root + mcp-server, OR the skew is documented with the `mcp-use` peer constraint that forces it
- [ ] `npm audit fix` (non-force) applied; before/after advisory counts recorded in the report
- [ ] `npm run build` exits 0; `npm run lint` exits 0
- [ ] No `--force` audit fix was run; no Stripe/Solana/Next-major bumps
- [ ] No source files changed (or, if one was unavoidable, it is documented and was approved via STOP)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `npm audit fix` wants to make a breaking change or pulls a major bump (it will say so) — stop, do not `--force`.
- Aligning Zod breaks `npm run mcp:build` and the cause is a real `mcp-use` peer requirement.
- Any dep update requires editing source call sites — report the call sites and the error; do not refactor under this plan.
- The build was already failing before your changes (red baseline — escalate).

## Maintenance notes

- For the reviewer: confirm no major versions moved and that `package-lock.json` changes are limited to patch/minor.
- Deferred to plan 008: the `@solana/*` vulnerability chain (needs a spike, not a bump).
- Deferred (rejected by audit): Stripe SDK majors — revisit only when a concrete need arises.
- Re-run `npm audit` periodically; consider adding `npm audit --omit=dev` as a non-blocking CI step in a future iteration of plan 005.
