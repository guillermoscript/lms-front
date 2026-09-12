# E2E tests (Playwright)

Everything Playwright runs lives in `tests/playwright/`. That is the only
`testDir` in `playwright.config.ts`; a `*.spec.ts` anywhere else is dead code
(#668 deleted the last of those). Unit tests are Vitest, in `tests/unit/`
(`npm run test:unit`). Demo recordings are `tests/demos/*.demo.ts` with their
own config (`npm run demo:720`).

## Prerequisites

1. Local Supabase with the seed: `supabase start` (first time) or
   `npm run db:reset` (migrations + `supabase/seed.sql`).
2. `.env.local` pointing at it (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
   anon + service-role keys, `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me`).
3. Browsers: `npx playwright install chromium`.

The suite boots its own app server (`webServer` in `playwright.config.ts`):
locally `next dev` on the port of `BASE_URL` (default `http://lvh.me:3000`),
reusing a server that is already listening; in CI `next start` on the build the
job just made. Always use `lvh.me`, never `localhost`: the tenant proxy needs a
subdomain (`default.lvh.me`, `code-academy.lvh.me`), and on `localhost` every
authenticated test bounces to `/join-school`.

## Running

```bash
npx playwright test                                   # whole suite, desktop-chromium, headless
npx playwright test tests/playwright/auth-security.spec.ts
npx playwright test -g "student can enroll"           # by title
npx playwright test --project=mobile                  # Pixel 5 viewport
npx playwright test --project=human --headed          # slowMo 500 ms, video on (demos, QA GIFs)
npx playwright test --headed                          # visible browser for any run
npx playwright test --ui                              # interactive runner
npx playwright show-report                            # last HTML report
```

Every run is headless unless you pass `--headed`. A bare run drives only
`desktop-chromium`; `mobile`, `human` and `human-mobile` take part only when
named with `--project` (`npm run test:e2e:mobile`, `test:e2e:all`,
`test:e2e:human`), so a file with 7 tests runs 7 tests, not 28.

`workers` is pinned to 1: the specs mutate one shared seeded database, and
GoTrue rate-limits sign-ins per IP. Do not raise it locally.

## Seeded accounts

From `supabase/seed.sql` (password `password123` for all). These are the only
accounts a spec may log in with; anything else does not exist after
`db:reset`.

| Account | Tenant | Role |
|---|---|---|
| `student@e2etest.com` | Default School (`default.lvh.me`) | student |
| `owner@e2etest.com` | Default School | admin, also super admin (`/platform/*`) |
| `creator@codeacademy.com` | Code Academy (`code-academy.lvh.me`) | admin |
| `alice@student.com` | Code Academy | student |

Specs that need more (a tenant at its plan cap, a second student, a manual
product) create it in `beforeAll` with the service-role client and remove it in
`afterAll`. See `tests/playwright/utils/plan-gate-fixtures.ts` for the pattern.

## Layout

```
tests/
├── playwright/
│   ├── *.spec.ts               # the suite (one file per surface or loop)
│   └── utils/
│       ├── auth.ts             # login, loginAsStudent/Teacher/Admin/TenantStudent/SuperAdmin
│       ├── constants.ts        # BASE, TENANT_BASE, LOCALE, ACCOUNTS
│       ├── seed-state.ts       # tenant ids, seeded plan ids, restore helpers
│       ├── plan-gate-fixtures.ts # throwaway tenants + tiny plan rows for limit specs
│       ├── sidebar.ts          # openSidebarGroup
│       └── images.ts           # noisePng, tinyPdf upload fixtures
├── unit/                       # Vitest
├── demos/                      # *.demo.ts recordings, own config
├── sql/                        # SQL scripts referenced by issues
└── README.md
```

Highest-value specs when something in auth, tenancy or money changes:
`tenant-isolation`, `auth-security`, `payment-flows`, `evaluations-security`,
and the three loop specs (`loop-1-creator-publishes`, `loop-2-student-learns`,
`loop-3-student-pays`).

## Writing a spec

- Import the helpers instead of re-implementing login:

  ```ts
  import { test, expect } from '@playwright/test'
  import { loginAsTenantStudent } from './utils/auth'
  import { TENANT_BASE, LOCALE } from './utils/constants'

  test('student sees the browse page', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/student/browse`)
    await expect(page.getByTestId('browse-page')).toBeVisible()
  })
  ```

- Every URL carries the locale (`/en/...`) and a tenant host. Build it from
  `BASE` / `TENANT_BASE`, never a literal host.
- Prefer `getByRole` / `getByTestId`; the UI is `@base-ui/react`, so a
  Playwright click on a Button sometimes needs `page.evaluate(() => el.click())`.
- Specs that change shared DB state (plans, subscriptions, entitlements) gate on
  `testInfo.project.name === 'desktop-chromium'` so they run once per suite.

## Skips

A skip is either **conditional** (data or env is missing at runtime) or
**permanent** (the feature is not built yet). Rules:

- Conditional skips always carry a reason string:
  `test.skip(!seededProductId, 'no manual product could be seeded')`. Never a
  bare `test.skip()`.
- Env-gated skips (`test.skip(!process.env.X, ...)`) are a CI bug: the `e2e`
  job provides every variable a spec gates on, and
  `scripts/ci/check-e2e-skips.mjs` fails the job when one still skips. If you
  add a new `process.env.X` gate, add `X` to the job env in
  `.github/workflows/ci.yml`.
- Permanent skips (`test.describe.skip`) must name the tracking issue in the
  title or reason, and the PR that closes that issue un-skips them. Today there
  are none — the last one (`Platform Referrals`) went away with the dead code it
  guarded in #680. Prefer deleting a skipped block over letting it rot: git
  history keeps the implementation, and the tracking issue keeps the intent.

## CI

The suite runs in GitHub Actions on every pull request and on every push to
`master`: job `e2e` in `.github/workflows/ci.yml` (#667). `deploy.yml` waits
for that workflow to pass before it builds and ships the image.

Per shard (4 shards, `fail-fast: false`):

1. `supabase start`: the local stack with migrations + `seed.sql`, same state
   as `npm run db:reset`.
2. Exports the stack's anon / service-role keys into the job env.
3. `npm run build`, then Playwright's `webServer` starts `next start` on
   `lvh.me:3000` (`/etc/hosts` pins `lvh.me`, `default.lvh.me`,
   `code-academy.lvh.me`).
4. `npx playwright test --project=desktop-chromium --shard=N/4`. Tests inside
   a shard run serially (`workers: 1`) because they mutate one shared database.
5. `node scripts/ci/check-e2e-skips.mjs` writes the job summary
   (passed / failed / flaky / skipped) and fails the job if any test skipped
   because an env var was missing. Project-gated and data-gated skips are
   listed, not failed.

Nightly (`schedule`) the job also runs the `mobile` project. `workflow_dispatch`
takes an `e2e_projects` input for ad-hoc runs. Reports and traces are uploaded
as `playwright-report-shard-N` artifacts.

## Debugging

```bash
npx playwright test --trace on <spec>    # then: npx playwright show-trace test-results/**/trace.zip
npx playwright test --debug <spec>       # inspector, step through
```

`await page.pause()` inside a test stops it with the inspector open. Videos and
screenshots are kept on failure under `test-results/`; a fresh run wipes that
directory, so copy anything you want to keep first.
