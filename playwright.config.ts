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

/**
 * Playwright Test Configuration
 *
 * Projects:
 *   desktop-chromium  — Default desktop tests (fast)
 *   mobile            — Pixel 5 mobile viewport
 *   human             — Desktop with slow-mo (500ms) for demos and debugging
 *   human-mobile      — Mobile with slow-mo (500ms) for demos and debugging
 *
 * Usage:
 *   npx playwright test                                    # desktop only
 *   npx playwright test --project=mobile                   # mobile only
 *   npx playwright test --project=human                    # slow desktop (human speed)
 *   npx playwright test --project=human-mobile             # slow mobile
 *   npx playwright test --project=desktop-chromium --project=mobile  # both viewports
 *   npx playwright test --headed --project=human           # visible browser, human speed
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
    headless: isCI,
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
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'human',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { slowMo: 500 },
        video: 'on',
      },
    },
    {
      name: 'human-mobile',
      use: {
        ...devices['Pixel 5'],
        launchOptions: { slowMo: 500 },
        video: 'on',
      },
    },
  ],
});
