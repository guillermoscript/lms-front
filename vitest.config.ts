import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  // Widget sources are .tsx; the app's tsconfig sets jsx: 'preserve' for Next,
  // which esbuild can not execute. Compile JSX for tests instead.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
    // mcp-server has its own node_modules; without this, widget sources under
    // it load a second copy of React and hooks blow up mid-render.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
})
