import { defineConfig } from 'vitest/config'

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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
  },
})
