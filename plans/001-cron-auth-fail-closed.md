# Plan 001: Cron endpoints reject requests when CRON_SECRET is unset (fail closed)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e58974fb..HEAD -- app/api/cron/ .env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e58974fb`, 2026-06-15

## Why this matters

Both cron route handlers authenticate with `if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) return 401`. The `process.env.CRON_SECRET &&` guard means that **when `CRON_SECRET` is not configured, the whole check is skipped and the endpoint is fully public**. `.env.example` marks `CRON_SECRET` as "Optional", so a deployment can easily ship with it unset. One of these endpoints (`/api/cron/solana-pull`) submits real on-chain Solana token transfers (pulls funds from subscribers); the other (`/api/cron/expire-subscriptions`) revokes entitlements. An unauthenticated caller who discovers either URL can trigger fund movement or mass subscription expiry. After this plan, the secret is **required**: if it is unset, every request is rejected, so a misconfiguration fails loudly instead of silently disabling auth.

## Current state

- `app/api/cron/solana-pull/route.ts` — Solana auto-pull crank; GET handler. Auth block:
  ```ts
  // app/api/cron/solana-pull/route.ts:38-42
  export async function GET(req: NextRequest) {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '')
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  ```
- `app/api/cron/expire-subscriptions/route.ts` — daily subscription-expiry cron; GET handler. Identical auth block:
  ```ts
  // app/api/cron/expire-subscriptions/route.ts:45-49
  export async function GET(req: NextRequest) {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '')
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  ```
- `.env.example:81` — `CRON_SECRET=    # Optional — protects cron endpoints (/api/cron/*)`
- These are the **only two** files under `app/api/cron/`.

Convention: route handlers return `NextResponse.json({ error: '...' }, { status: 401 })` for auth failures (already used above). Match it exactly.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Install   | `npm install`                        | exit 0              |
| Lint      | `npm run lint`                       | exit 0, no new errors |
| Build/typecheck | `npm run build`                | exit 0 (compiles)   |
| Grep gate | see Done criteria                    | as stated           |

## Scope

**In scope** (the only files you should modify):
- `app/api/cron/solana-pull/route.ts`
- `app/api/cron/expire-subscriptions/route.ts`
- `.env.example` (the `CRON_SECRET` comment only)

**Out of scope** (do NOT touch):
- `vercel.json` — `solana-pull` is intentionally not registered there (triggered externally); do not add or remove cron registrations.
- Any other `process.env.X && ...` checks outside `app/api/cron/` — if you find the same anti-pattern elsewhere, record it in your report under STOP, do not fix it here.
- The body logic of either cron job (env config checks, DB queries) — only the auth gate changes.

## Git workflow

- Branch: `advisor/001-cron-auth-fail-closed`
- One commit; message style is conventional commits (see `git log --oneline -5`, e.g. `fix(payments): ...`). Suggested: `fix(security): require CRON_SECRET on cron endpoints (fail closed)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the fail-open auth gate in both cron routes

In **both** `app/api/cron/solana-pull/route.ts` and `app/api/cron/expire-subscriptions/route.ts`, replace the existing auth block with this fail-closed version (note: secret is now required):

```ts
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
```

Keep the rest of each handler unchanged.

**Verify**: `grep -rn "process.env.CRON_SECRET &&" app/api/cron/` → **no output** (exit 1).

### Step 2: Mark CRON_SECRET as required in .env.example

Change the `.env.example:81` comment from "Optional" to "Required". Replace the line with:

```
CRON_SECRET=                                       # Required — protects cron endpoints (/api/cron/*); unset = all cron requests rejected
```

**Verify**: `grep -n "CRON_SECRET" .env.example` → shows the line containing `Required`.

### Step 3: Confirm the codebase still compiles and lints

**Verify**: `npm run lint` → exit 0 (no new errors in the two route files). Then `npm run build` → exit 0.

## Test plan

There is no unit-test runner for route handlers in this repo at this commit (added by plan 002), and these handlers depend on live env + Supabase, so no automated test is added here. Manual verification (for the reviewer, not required to pass this plan):
- With `CRON_SECRET` unset, a `GET /api/cron/expire-subscriptions` returns 401.
- With `CRON_SECRET` set, a request with `Authorization: Bearer <wrong>` returns 401, and `Bearer <correct>` proceeds.

If plan 002 has already landed when you execute this, you MAY add a tiny unit test asserting the gate logic only if you can do so without importing Supabase; otherwise skip — do not expand scope to mock Supabase.

## Done criteria

ALL must hold:

- [ ] `grep -rn "process.env.CRON_SECRET &&" app/api/cron/` returns no matches
- [ ] `grep -rn "!cronSecret || provided !== cronSecret" app/api/cron/` returns exactly 2 matches
- [ ] `.env.example` `CRON_SECRET` line contains "Required"
- [ ] `npm run lint` exits 0; `npm run build` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The auth block in either route does not match the "Current state" excerpt (codebase drifted).
- A new cron route exists under `app/api/cron/` not listed in Scope.
- `grep -rn "process.env.[A-Z_]* &&" app/api/` reveals the same fail-open pattern on other auth gates — report the file:line list; do not fix here.
- `npm run build` fails for reasons unrelated to your change.

## Maintenance notes

- For the reviewer: confirm the secret is now compared with strict inequality and that an unset secret rejects (the `!cronSecret` clause).
- Follow-up deferred: `/api/cron/solana-pull` is not registered in `vercel.json` crons — if it should run on Vercel schedule, that is a separate config change (out of scope here).
- Any future cron route must copy this fail-closed gate, not the old pattern. Consider extracting a shared `assertCronAuth(req)` helper in a later refactor (not now).
