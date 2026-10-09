import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Test runner for the MCP server package (issue #549 §0).
 *
 * `mcp-server` is not an npm workspace of the root package and has no vitest of
 * its own; npm puts every ancestor `node_modules/.bin` on PATH, so `npm test`
 * here resolves the root Vitest binary without adding an install step. Vite
 * resolves the package's `.js` specifiers (`../session.js`) back to their `.ts`
 * sources, so tests import the tool modules exactly as the server does.
 */
export default defineConfig({
  // Parity tests import the app's own `lib/` modules, which use the root `@/`
  // alias. Nothing under mcp-server imports `@/` (the image ships without
  // `lib/`), so this only ever resolves in tests.
  resolve: {
    alias: { '@': resolve(import.meta.dirname, '..') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
  },
})
