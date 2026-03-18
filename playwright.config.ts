import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

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
 */
export default defineConfig({
  testDir: 'tests/playwright',
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: !!process.env.CI,
  workers: process.env.CI ? undefined : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html']],
  use: {
    actionTimeout: 0,
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: !!process.env.CI,
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
