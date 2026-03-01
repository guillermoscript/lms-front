import { defineConfig, devices } from '@playwright/test'

const resolution = process.env.DEMO_RES === '1080'
  ? { width: 1920, height: 1080 }
  : { width: 1280, height: 720 }

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.demo.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './recordings',
  use: {
    actionTimeout: 15_000,
    headless: true,
    launchOptions: {
      slowMo: 150,
    },
    video: {
      mode: 'on',
      size: resolution,
    },
    viewport: resolution,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: `demo-${process.env.DEMO_RES === '1080' ? '1080p' : '720p'}`,
      use: { ...devices['Desktop Chrome'], viewport: resolution },
    },
  ],
})
