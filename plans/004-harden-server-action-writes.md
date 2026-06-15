# Plan 004: Harden server-action writes — check swallowed errors in join-school and add ownership checks to MCP token actions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e58974fb..HEAD -- app/actions/join-school.ts app/actions/mcp-tokens.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (join-school touches the onboarding path; test the happy path manually)
- **Depends on**: none
- **Category**: bug / security
- **Planned at**: commit `e58974fb`, 2026-06-15

## Why this matters

Two server actions write to the database without the checks their neighbors already use:

1. **`joinCurrentSchool()`** awaits three mutations whose errors are never inspected — the `tenant_invitations` status update, the `gamification_profiles` upsert, and the `auth.admin.updateUserById(...{ app_metadata: { tenant_id } })` call that the JWT hook reads to populate tenant claims. If any fail, the function still returns `{ success: true }`. The worst case is the `app_metadata.tenant_id` update failing silently: the user "joins" but their JWT never gets the tenant claim, breaking tenant resolution on the next request.

2. **`revokeMcpToken()` / `deleteMcpToken()`** gate on role (teacher/admin) but never verify the token belongs to the caller before `.update()`/`.delete()` by `id`. Today RLS on `mcp_api_tokens` (policy `user_id = auth.uid()`) blocks cross-user writes, so this is not currently exploitable — but it is fragile defense-in-depth: the same file's `listMcpTokens()` already filters by `user_id`, and if anyone ever switches this client to the service-role admin client (a common reflex when "a query mysteriously returns nothing"), it becomes a real IDOR. Adding the ownership filter costs one `.eq()` and removes the foot-gun.

## Current state

`app/actions/join-school.ts` — unchecked awaits:
```ts
// app/actions/join-school.ts:82-89  (invitation accept — error not checked)
if (invitation) {
  assignedRole = invitation.role as 'student' | 'teacher'
  await adminClient
    .from('tenant_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)
}

// app/actions/join-school.ts:108-119  (gamification upsert + app_metadata — errors not checked)
await adminClient
  .from('gamification_profiles')
  .upsert(
    { user_id: user.id, tenant_id: tenantId, total_xp: 0, level: 1 },
    { onConflict: 'user_id,tenant_id', ignoreDuplicates: true }
  )

await adminClient.auth.admin.updateUserById(user.id, {
  app_metadata: { tenant_id: tenantId },
})
```
The same function already demonstrates the correct pattern at lines 94-106 (the `tenant_users` insert): destructure `{ error }`, log, and return `{ success: false, error: '...' }` on failure.

`app/actions/mcp-tokens.ts` — the correct ownership pattern already exists in the read path:
```ts
// app/actions/mcp-tokens.ts:67-72  (listMcpTokens — correctly scoped)
const { data, error } = await supabase
  .from('mcp_api_tokens')
  .select(...)
  .eq('user_id', userId)
```
But the write paths are not scoped:
```ts
// app/actions/mcp-tokens.ts:77-94  revokeMcpToken
export async function revokeMcpToken(tokenId: number) {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') throw new Error('Unauthorized')
  const supabase = await createClient()
  const { error } = await supabase
    .from('mcp_api_tokens')
    .update({ is_active: false })
    .eq('id', tokenId)             // <-- no user_id scope
  if (error) throw new Error(error.message)
  ...
}

// app/actions/mcp-tokens.ts:96-113  deleteMcpToken — same shape, .delete()
```
`getCurrentUserId()` is already imported and used in `listMcpTokens` (returns the caller's id or null).

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm install`          | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0 (or `npm run build` if plan 002 not landed) |
| Build     | `npm run build`        | exit 0              |
| Lint      | `npm run lint`         | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `app/actions/join-school.ts`
- `app/actions/mcp-tokens.ts`

**Out of scope** (do NOT touch):
- The `tenant_users` insert in join-school (lines 94-106) — already correct.
- The `supabase.auth.updateUser({ data: { preferred_tenant_id } })` call (a soft preference; its failure is non-critical — you MAY log it but do not fail the action on it).
- The RLS policies / migrations for `mcp_api_tokens` — do not change DB; this is an application-layer hardening.
- `createMcpToken` / `listMcpTokens` — leave unchanged.

## Git workflow

- Branch: `advisor/004-harden-server-action-writes`
- One commit: `fix(security): check write errors in join-school and scope MCP token writes to owner`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: join-school — fail loud on critical write failures

In `app/actions/join-school.ts`, check the errors on the **invitation update**, the **gamification upsert**, and the **`app_metadata` update**. Follow the existing pattern at lines 94-106. Treat the `app_metadata.tenant_id` write as critical (it drives JWT claims). Example for the `app_metadata` write:

```ts
const { error: metaError } = await adminClient.auth.admin.updateUserById(user.id, {
  app_metadata: { tenant_id: tenantId },
})
if (metaError) {
  console.error('Failed to set tenant_id app_metadata:', metaError)
  return { success: false, error: 'Failed to finalize school membership. Please try again.' }
}
```
For the invitation update and gamification upsert, destructure `{ error }` and `console.error` on failure. For these two, prefer logging and continuing **only if** the membership is already established — but since both run before the function returns success, the safest choice is: log the invitation-update error and continue (invitation bookkeeping is non-blocking), and log the gamification-upsert error and continue (a missing gamification profile is recoverable and shouldn't block joining). The **only** one that must return `{ success: false }` is the `app_metadata` failure. Keep the return-shape identical to the existing failure return at line 105.

**Verify**: `npm run build` → exit 0. Re-read the function: every `await adminClient...` now either destructures `{ error }` and handles it, or has an explicit comment saying why its failure is ignored.

### Step 2: mcp-tokens — scope writes to the owner

In `revokeMcpToken` and `deleteMcpToken`, fetch the caller id and add `.eq('user_id', userId)` to the write, then verify a row was affected. For `revokeMcpToken`:

```ts
export async function revokeMcpToken(tokenId: number) {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') throw new Error('Unauthorized')

  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  const { data: updated, error } = await supabase
    .from('mcp_api_tokens')
    .update({ is_active: false })
    .eq('id', tokenId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!updated) throw new Error('Token not found')

  revalidatePath('/dashboard/admin/api-tokens')
  revalidatePath('/dashboard/teacher/api-tokens')
}
```
Apply the equivalent change to `deleteMcpToken` (`.delete().eq('id', tokenId).eq('user_id', userId).select('id').maybeSingle()`, then `if (!deleted) throw new Error('Token not found')`).

**Verify**: `npm run build` → exit 0.

### Step 3: Final verification

**Verify**: `npm run lint` → exit 0; `npm run typecheck` (or `npm run build`) → exit 0.

## Test plan

- If plan 002 (Vitest) has landed: these functions call Supabase + `getUserRole()` (which calls `getUser()`), so they are not cleanly unit-testable without mocking. Do **not** add mock-heavy unit tests here.
- Manual verification for the reviewer:
  - join-school happy path still returns `{ success: true }` and the user lands in the new tenant with correct role.
  - Revoking a token id that belongs to another user throws "Token not found" rather than silently succeeding.
- E2E: the existing `tests/playwright/` has join/onboarding coverage — confirm `npx playwright test -g "join"` still passes if the environment is available (optional; do not block on env setup).

## Done criteria

ALL must hold:

- [ ] In `join-school.ts`, the `app_metadata` write returns `{ success: false }` on error; the invitation update and gamification upsert each destructure `{ error }` and log (or have an explicit "ignored because…" comment)
- [ ] `revokeMcpToken` and `deleteMcpToken` both include `.eq('user_id', userId)` and throw "Token not found" when no row is affected
- [ ] `grep -n "\.eq('user_id', userId)" app/actions/mcp-tokens.ts` returns ≥3 matches (list + revoke + delete)
- [ ] `npm run build` exits 0; `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code.
- `getCurrentUserId` is not importable in `mcp-tokens.ts` (it should already be imported — confirm at the top of the file).
- Changing join-school's return on `app_metadata` failure breaks an existing E2E test that asserts success even when metadata writes fail (report the test).

## Maintenance notes

- For the reviewer: the security-relevant change is the `.eq('user_id', userId)` on token writes (defense-in-depth behind RLS) and failing the join when the JWT-claim metadata write fails.
- Follow-up deferred: a broader sweep of all `app/actions/**` for unchecked `await adminClient...` writes would be valuable but is out of scope here (would balloon the diff). Note it for a future `tech-debt` plan.
