import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const isCI = !!process.env.CI;
// lvh.me (not localhost) — it resolves to 127.0.0.1 with wildcard subdomains,
// which the tenant proxy needs. On localhost no subdomain resolves, so every
// tenant falls back to the default and authenticated tests bounce to /join-school.
const baseURL = process.env.BASE_URL || 'http://lvh.me:3000';
const port = Number(new URL(baseURL).port || 3000);

// Specs that create a school on the fly (loop-1-creator-publishes) land on a
// subdomain nobody pinned in /etc/hosts. Resolve every *.<platform host> to
// loopback inside the browser so a fresh slug works on a runner with no
// public DNS for lvh.me, and the suite never depends on that DNS at all.
const platformHost = new URL(baseURL).hostname;
const chromiumArgs = [`--host-resolver-rules=MAP *.${platformHost} 127.0.0.1, MAP ${platformHost} 127.0.0.1`];

/**
 * Playwright Test Configuration
 *
 * Projects:
 *   desktop-chromium  — Default desktop tests (fast, headless)
 *   mobile            — Pixel 5 mobile viewport
 *   human             — Desktop with slow-mo (500ms) + video, for demos and debugging
 *   human-mobile      — Mobile with slow-mo (500ms) + video, for demos and debugging
 *
 * A bare run is headless and covers `desktop-chromium` only — the same shape
 * CI runs. The other projects only take part when named with `--project`, so
 * a bare run never quadruples its wall-clock by also driving two slow-mo
 * browsers (it used to: 28 tests and 9 min for a 7-test spec).
 *
 * Usage:
 *   npm run test:e2e                                       # headless desktop (default)
 *   npm run test:e2e:mobile                                # headless Pixel 5
 *   npm run test:e2e:all                                   # desktop + mobile
 *   npm run test:e2e:human                                 # headed, slow-mo, video (demos, GIFs)
 *   npx playwright test --headed                           # any run, visible browser
 *   npx playwright test --project=mobile -g "create exam"  # one project, one test
 *
 * CI (.github/workflows/ci.yml, job `e2e`) runs `desktop-chromium` sharded
 * across runners against a local Supabase stack, then
 * `scripts/ci/check-e2e-skips.mjs` fails the job if any test skipped because
 * an env var was missing (#667).
 */
export default defineConfig({
  testDir: 'tests/playwright',
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: isCI,
  // One worker everywhere. The specs share one seeded database (plan rows,
  // tenant plans, entitlements are mutated in place) and GoTrue rate-limits
  // sign-ins per IP; CI gets its parallelism from `--shard`, each shard with
  // its own Supabase stack.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [
        ['line'],
        ['github'],
        ['html', { open: 'never' }],
        // Read by scripts/ci/check-e2e-skips.mjs for the job summary + env-skip gate.
        ['json', { outputFile: 'playwright-report/results.json' }],
      ]
    : [['list'], ['html']],
  use: {
    actionTimeout: 0,
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Headless everywhere; `--headed` (or the `human*` projects via
    // `npm run test:e2e:human`) opts back into a visible browser.
    headless: true,
  },
  // The suite boots its own app server. In CI that is the production build
  // the job just made (`next build`); locally it is a dev server, and a server
  // already listening on the port (your `npm run dev`) is reused instead.
  webServer: {
    command: isCI ? `npx next start -p ${port}` : `npx next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: selectProjects([
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: chromiumArgs } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], launchOptions: { args: chromiumArgs } },
    },
    {
      name: 'human',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { slowMo: 500, args: chromiumArgs },
        video: 'on',
        headless: false,
      },
    },
    {
      name: 'human-mobile',
      use: {
        ...devices['Pixel 5'],
        launchOptions: { slowMo: 500, args: chromiumArgs },
        video: 'on',
        headless: false,
      },
    },
  ]),
});

type Project = NonNullable<Parameters<typeof defineConfig>[0]['projects']>[number]

/**
 * A bare `npx playwright test` sees only `desktop-chromium`. As soon as the
 * command names a project (`--project=mobile`, `--project=human`) all four are
 * available and Playwright filters among them as usual, so CI's explicit
 * `--project` flags and the README recipes keep working unchanged.
 *
 * Worker processes re-evaluate this file WITHOUT the CLI argv, and a project
 * list that differs from the runner's fails with "Project not found in the
 * worker process". The decision is therefore taken once, in the runner, and
 * pinned into an env var every worker inherits.
 */
function selectProjects(all: Project[]): Project[] {
  if (process.argv.some((a) => a === '--project' || a.startsWith('--project='))) {
    process.env.E2E_ALL_PROJECTS = '1'
  }
  return process.env.E2E_ALL_PROJECTS ? all : all.filter((p) => p.name === 'desktop-chromium')
}
