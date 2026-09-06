// Local-only: same suite, every test recorded. Used to produce PR evidence.
import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  use: { ...base.use, video: 'on' },
})
