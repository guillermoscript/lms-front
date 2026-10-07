import { describe, expect, it } from 'vitest'

import en from '@/messages/en.json'
import es from '@/messages/es.json'
import { liveFeatureCheck, modelsForKind, warningText } from '@/components/admin/ai/helpers'
import { AI_FEATURE_IDS } from '@/lib/ai/features'
import { PROVIDER_IDS } from '@/lib/ai/provider-ids'
import type { AiProviderDTO } from '@/app/actions/admin/ai-settings'

const catalogs = { en: en.aiSettings, es: es.aiSettings } as const

const provider = (over: Partial<AiProviderDTO> = {}): AiProviderDTO => ({
  provider: 'openai',
  label: 'OpenAI',
  kinds: ['language', 'stt', 'realtime', 'image'],
  voices: [],
  connected: true,
  status: 'active',
  last4: '1234',
  validatedAt: null,
  lastErrorCode: null,
  lastUsedAt: null,
  models: [{ id: 'gpt-4o' }, { id: 'text-embedding-3-small' }, { id: 'whisper-1' }],
  modelsCachedAt: null,
  ...over,
})

describe('AI settings messages', () => {
  for (const [locale, m] of Object.entries(catalogs)) {
    it(`${locale}: every feature has a name and description`, () => {
      for (const id of AI_FEATURE_IDS) {
        const f = (m.features as Record<string, { name: string; description: string }>)[id]
        expect(f?.name, id).toBeTruthy()
        expect(f?.description, id).toBeTruthy()
      }
    })
    it(`${locale}: every provider kind and action error has copy`, () => {
      for (const k of ['language', 'stt', 'realtime', 'image']) expect((m.providers.kinds as Record<string, string>)[k]).toBeTruthy()
      for (const e of [
        'unauthorized', 'invalid_input', 'rate_limited', 'key_rejected', 'provider_unreachable', 'not_found',
        'no_credential', 'provider_not_allowed', 'model_blocked', 'invalid_voice', 'server_misconfigured', 'save_failed', 'ai_failed',
      ]) expect((m.errors as Record<string, string>)[e], e).toBeTruthy()
    })
  }
  it('lists all providers the server knows', () => {
    expect(PROVIDER_IDS.length).toBeGreaterThan(0)
  })
})

describe('AI settings helpers', () => {
  it('offers only models that fit the kind', () => {
    const p = provider()
    expect(modelsForKind(p, 'language').map((m) => m.id)).toEqual(['gpt-4o'])
    expect(modelsForKind(p, 'stt').map((m) => m.id)).toEqual(['whisper-1'])
  })

  it('blocks a language model for speech-to-text and flags missing structured output softly', () => {
    const p = provider()
    expect(liveFeatureCheck('speech_stt', p, 'gpt-4o').blocked).toBe('not_a_speech_model')
    expect(liveFeatureCheck('speech_stt', p, 'whisper-1').blocked).toBeNull()
    expect(liveFeatureCheck('exercise_grader', p, '').missing).toEqual([])
  })

  it('maps server warnings onto message keys', () => {
    const t = (key: string) => key
    expect(warningText(t, 'missing_cap:vision')).toBe('warnings.missing_cap.vision')
    expect(warningText(t, 'model_not_in_list')).toBe('warnings.model_not_in_list')
  })
})
