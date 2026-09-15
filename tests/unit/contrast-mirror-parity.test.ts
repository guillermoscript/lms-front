import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `lib/color/contrast.ts` is hand-mirrored at `mcp-server/views/shared/contrast.ts`
 * because the MCP server is bundled separately and cannot import from `lib/`.
 * Comments may differ (each copy explains its own consumers); the code may not.
 */

const ROOT = resolve(__dirname, '../..')

function codeOnly(path: string): string[] {
  return readFileSync(resolve(ROOT, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
}

describe('contrast helper mirror', () => {
  it('keeps the mcp-server copy identical to lib/ below its comments', () => {
    const lib = codeOnly('lib/color/contrast.ts')
    const mirror = codeOnly('mcp-server/views/shared/contrast.ts')
    expect(lib.length).toBeGreaterThan(100)
    expect(mirror).toEqual(lib)
  })
})
