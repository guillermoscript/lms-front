# Plan 002: Add a standalone typecheck script and a Vitest unit-test runner

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e58974fb..HEAD -- package.json tsconfig.json vitest.config.ts`
> If `package.json` already defines a `typecheck` or `test:unit` script, or a
> `vitest.config.ts` exists, treat it as a STOP condition and report what is
> already there.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `e58974fb`, 2026-06-15

## Why this matters

This repo has **no standalone typecheck command** (type errors only surface inside the slow `next build`) and **no unit-test runner at all** — `npm test` runs Playwright E2E, which needs a running app + seeded Supabase. The result: there is no fast, side-effect-free way to verify a code change, which makes every other improvement (especially the payment-logic fixes and tests in later plans) slow and risky to validate. This plan establishes the verification baseline that plans 003, 005, and 006 depend on: a `typecheck` script and a working Vitest setup that can import the repo's `@/` path alias and TypeScript modules. It deliberately adds **only the wiring plus one trivial smoke test** — real test coverage comes in plan 006.

## Current state

- `package.json` scripts (no `typecheck`, no `test:unit`; `test` is Playwright):
  ```json
  // package.json:8-24 (excerpt)
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "npx playwright test",
    ...
  }
  ```
- `package.json` devDependencies already include `typescript: "^5"` and `tsx: "^4.21.0"`. There is **no** `vitest`, `husky`, or `lint-staged`.
- Path alias: imports use `@/...` (e.g. `@/lib/payments/types`). `tsconfig.json` defines the `@/*` → repo-root mapping; Vitest must be configured to resolve it.
- `lib/payments/types.ts` exports `PROVIDER_CAPABILITIES` (a plain object) — a good import target for proving alias + TS resolution works under Vitest without touching any I/O.

Convention: this is an npm workspace repo (`package-lock.json`, `workspaces: ["packages/*"]`). Use `npm`, not pnpm/yarn.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `npm install`                    | exit 0              |
| Typecheck (new) | `npm run typecheck`        | exit 0, no errors   |
| Unit tests (new) | `npm run test:unit`       | 1 file, all pass    |
| Lint      | `npm run lint`                   | exit 0              |

## Scope

**In scope** (create or modify only these):
- `package.json` (add 2 scripts + `vitest` devDependency)
- `vitest.config.ts` (create)
- `tests/unit/smoke.test.ts` (create)
- `package-lock.json` (will change from `npm install` — expected)

**Out of scope** (do NOT touch):
- `tsconfig.json` — only read it to confirm the `@/*` alias; do not edit.
- Any source file under `app/`, `lib/`, `components/`, `hooks/`, `packages/`.
- Playwright config / existing `tests/playwright/` — Vitest and Playwright coexist; do not merge them.
- Do NOT add `@vitejs/plugin-react` or jsdom — this baseline tests pure logic in a `node` environment only. Component testing is out of scope.

## Git workflow

- Branch: `advisor/002-verification-baseline`
- One commit; conventional-commit style: `chore(dx): add typecheck script and vitest unit-test runner`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a typecheck script

In `package.json` `scripts`, add:
```json
"typecheck": "tsc --noEmit",
```

**Verify**: `npm run typecheck` → exit 0. (If it reports pre-existing type errors unrelated to your change, see STOP conditions.)

### Step 2: Install Vitest

Run: `npm install -D vitest@^3` (use the latest 3.x; if 3.x install fails, report the error — do not silently fall back to an older major).

**Verify**: `npx vitest --version` prints a 3.x version.

### Step 3: Create `vitest.config.ts`

Create `vitest.config.ts` at repo root with node environment and the `@/` alias resolved to the repo root:

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
})
```

### Step 4: Add the `test:unit` script

In `package.json` `scripts`, add:
```json
"test:unit": "vitest run",
```
(Use `vitest run`, not bare `vitest`, so CI does not hang in watch mode.)

### Step 5: Create the smoke test proving alias + TS resolution

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'

describe('vitest baseline', () => {
  it('runs and evaluates basic assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolves the @/ path alias and TypeScript modules from lib/', () => {
    // PROVIDER_CAPABILITIES is a plain exported object (no I/O), so importing it
    // proves Vitest can resolve "@/..." and compile project TS without a build.
    expect(PROVIDER_CAPABILITIES).toBeTypeOf('object')
    expect(Object.keys(PROVIDER_CAPABILITIES).length).toBeGreaterThan(0)
  })
})
```

**Verify**: `npm run test:unit` → 1 test file, 2 tests passed, exit 0.

> If the import on line 2 fails because `PROVIDER_CAPABILITIES` is not an export of `@/lib/payments/types`, open that file, pick any other top-level pure exported value/function (one that does not read env vars or call Supabase), import that instead, and assert it is defined. Do NOT import anything that performs I/O at module load.

### Step 6: Final verification

**Verify**: `npm run typecheck` → exit 0; `npm run test:unit` → exit 0; `npm run lint` → exit 0.

## Test plan

- New file `tests/unit/smoke.test.ts` covering: basic assertion (proves runner works) and an `@/` alias import (proves config + TS resolution).
- No existing structural pattern to follow (first unit test in the repo) — this file *is* the pattern that plan 006 will follow.
- Verification: `npm run test:unit` → all pass.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0 and reports ≥2 passing tests in 1 file
- [ ] `vitest.config.ts` exists at repo root
- [ ] `package.json` has both `typecheck` and `test:unit` scripts and `vitest` in devDependencies
- [ ] `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified except `package-lock.json` (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run typecheck` reports type errors that exist on the unmodified codebase (pre-existing errors). Report the full error list — do not attempt to fix source files; the typecheck script is still valuable but the baseline is "red" and that is itself a finding to escalate.
- `package.json` already defines `typecheck` or `test:unit`, or `vitest.config.ts` already exists.
- Vitest cannot resolve the `@/` alias after Step 3 (report the resolution error).
- `vitest@^3` is unavailable or incompatible with the installed Node version.

## Maintenance notes

- For the reviewer: confirm `test:unit` uses `vitest run` (not watch), and that the config `environment` is `node` (no jsdom pulled in).
- Plan 006 builds on this to add real payment-logic unit tests under `tests/unit/`.
- Plan 005 (CI) will call `npm run typecheck` and `npm run test:unit` as gates — keep their names stable.
- If a future change needs to unit-test React components, that requires adding jsdom + `@vitejs/plugin-react` and a separate `environment` override — deferred out of this plan.
