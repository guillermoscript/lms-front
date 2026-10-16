/**
 * #960: a streaming AI route must not return a bare `toUIMessageStreamResponse()`.
 * The AI SDK masks the stream's error part as "An error occurred." unless `onError`
 * maps it, so "out of credit" / "key rejected" / "provider down" never reach the client.
 */
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { AiProviderQuotaError, streamErrorText } from '@/lib/ai/errors'

const ROOT = resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

describe('streaming routes surface provider errors (#960)', () => {
  it('every toUIMessageStreamResponse call in app/ passes an onError', () => {
    const offenders: string[] = []
    for (const file of walk(join(ROOT, 'app'))) {
      const src = readFileSync(file, 'utf8')
      const re = /toUIMessageStreamResponse\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const rest = src.slice(m.index, m.index + 600)
        if (!/onError/.test(rest)) {
          offenders.push(`${relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('streamErrorText is the typed JSON body, never the raw provider message', () => {
    const raw = Object.assign(new Error('sk-secret-123 was rejected'), { name: 'AI_APICallError', statusCode: 401, responseBody: '' })
    const text = streamErrorText(raw, { feature: 'lesson_tutor', providerId: 'openai', canConfigure: true })
    expect(text).not.toContain('sk-secret')
    const body = JSON.parse(text)
    expect(body.error.code).toBe('ai_key_invalid')
    expect(body.error.feature).toBe('lesson_tutor')
    expect(body.error.settingsUrl).toBeTruthy()
  })

  it('hides the settings link from non-admins', () => {
    const text = streamErrorText(new AiProviderQuotaError(), { feature: 'aristotle', providerId: 'openai', canConfigure: false })
    const body = JSON.parse(text)
    expect(body.error.code).toBe('ai_quota')
    expect(body.error.settingsUrl).toBeNull()
  })
})
