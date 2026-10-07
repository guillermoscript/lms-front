import { describe, expect, it } from 'vitest'
import {
  checkFeatureModel,
  inferModelCaps,
  mergeCaps,
  missingCaps,
} from '@/lib/ai/capabilities'
import {
  AI_FEATURES,
  AI_FEATURE_IDS,
  featureAllowsProvider,
  featureChain,
  isAiFeature,
  providersForFeature,
} from '@/lib/ai/features'
import { PROVIDER_IDS } from '@/lib/ai/provider-ids'

describe('AI_FEATURES', () => {
  it('declares the 16 agreed features', () => {
    expect([...AI_FEATURE_IDS].sort()).toEqual(
      [
        'aristotle', 'aristotle_summary', 'lesson_tutor', 'lesson_verifier', 'checkpoint_grader',
        'exercise_coach', 'exercise_grader', 'speech_coach', 'speech_stt', 'voice_conversation',
        'exam_grader', 'question_generator', 'starter_course', 'course_architect', 'landing_builder',
        'image_generation',
      ].sort(),
    )
  })

  it('inherit chains match the spec and never cycle or dangle', () => {
    expect(featureChain('aristotle_summary')).toEqual(['aristotle_summary', 'aristotle'])
    expect(featureChain('lesson_verifier')).toEqual(['lesson_verifier', 'lesson_tutor'])
    expect(featureChain('checkpoint_grader')).toEqual(['checkpoint_grader', 'exercise_grader'])
    expect(featureChain('speech_coach')).toEqual(['speech_coach', 'exercise_grader'])
    expect(featureChain('exam_grader')).toEqual(['exam_grader'])
    for (const f of AI_FEATURE_IDS) {
      const parent = AI_FEATURES[f].inherits
      if (parent) expect(isAiFeature(parent)).toBe(true)
      expect(new Set(featureChain(f)).size).toBe(featureChain(f).length)
    }
  })

  it('restricts speech, voice and image to the agreed providers', () => {
    expect(AI_FEATURES.speech_stt.providers).toEqual(['assemblyai', 'openai', 'groq'])
    expect(AI_FEATURES.voice_conversation.providers).toEqual(['openai', 'xai', 'google'])
    expect(AI_FEATURES.image_generation.providers).toEqual(['openai', 'google'])
  })

  it('language features accept every text provider and never AssemblyAI', () => {
    const text = providersForFeature('lesson_tutor')
    expect(text).toEqual(expect.arrayContaining(['openai', 'anthropic', 'google', 'openrouter', 'groq', 'mistral', 'xai', 'deepseek']))
    expect(text).not.toContain('assemblyai')
    expect(featureAllowsProvider('exam_grader', 'assemblyai')).toBe(false)
  })

  it('every feature can be served by at least one provider', () => {
    for (const f of AI_FEATURE_IDS) expect(providersForFeature(f).length).toBeGreaterThan(0)
  })

  it('isAiFeature rejects non-features, including prototype keys', () => {
    expect(isAiFeature('aristotle')).toBe(true)
    expect(isAiFeature('toString')).toBe(false)
    expect(isAiFeature(undefined)).toBe(false)
  })
})

describe('inferModelCaps', () => {
  it.each([
    ['openai', 'gpt-5.6-luna', { language: true, tools: true, structured: true, vision: true }],
    ['openai', 'gpt-4o-mini', { language: true, vision: true }],
    ['openai', 'o3-mini', { language: true, vision: false }],
    ['openai', 'gpt-realtime', { realtime: true }],
    ['openai', 'gpt-4o-transcribe', { stt: true }],
    ['openai', 'whisper-1', { stt: true }],
    ['openai', 'gpt-image-1', { image: true }],
    ['openai', 'text-embedding-3-large', {}],
    ['anthropic', 'claude-sonnet-4-5', { language: true, tools: true, vision: true }],
    ['anthropic', 'claude-2.1', { language: true, vision: false }],
    ['google', 'gemini-2.5-pro', { language: true, tools: true, structured: true, vision: true }],
    ['google', 'gemini-live-2.5-flash', { realtime: true }],
    ['google', 'imagen-4.0-generate', { image: true }],
    ['google', 'text-embedding-004', {}],
    ['groq', 'whisper-large-v3-turbo', { stt: true }],
    ['groq', 'llama-3.3-70b-versatile', { language: true, tools: true, vision: false }],
    ['groq', 'llama-guard-4-12b', {}],
    ['mistral', 'pixtral-large-latest', { language: true, vision: true }],
    ['mistral', 'mistral-embed', {}],
    ['xai', 'grok-4', { language: true, vision: true }],
    ['deepseek', 'deepseek-chat', { language: true, tools: true, vision: false }],
    ['assemblyai', 'universal-2', { stt: true }],
    ['openrouter', 'anthropic/claude-sonnet-4.5', { language: true, tools: true, vision: true }],
  ] as const)('%s / %s', (provider, model, expected) => {
    expect(inferModelCaps(provider, model)).toMatchObject(expected)
  })

  it('unknown models infer nothing', () => {
    expect(inferModelCaps('openai', 'totally-new-thing')).toEqual({})
    expect(inferModelCaps('anthropic', 'mystery')).toEqual({})
  })

  it('never leaks a text capability onto stt / realtime / image models', () => {
    for (const [p, m] of [['openai', 'gpt-realtime'], ['openai', 'whisper-1'], ['google', 'imagen-4']] as const) {
      expect(inferModelCaps(p, m).language).toBeUndefined()
    }
  })
})

describe('mergeCaps / missingCaps', () => {
  it('provider-reported values win over the guess; undefined leaves the guess alone', () => {
    expect(mergeCaps({ vision: true, tools: true }, { vision: false })).toEqual({ vision: false, tools: true })
    expect(mergeCaps({ vision: true }, null)).toEqual({ vision: true })
  })

  it('treats unknown as missing', () => {
    expect(missingCaps({ tools: true }, ['tools', 'vision'])).toEqual(['vision'])
    expect(missingCaps({}, ['structured'])).toEqual(['structured'])
    expect(missingCaps({ vision: false }, ['vision'])).toEqual(['vision'])
  })
})

describe('checkFeatureModel', () => {
  it('blocks a provider the feature does not allow', () => {
    expect(checkFeatureModel('speech_stt', 'anthropic', 'claude-x')).toMatchObject({ blocked: true, reason: 'provider_not_allowed' })
    expect(checkFeatureModel('voice_conversation', 'groq', 'llama')).toMatchObject({ blocked: true, reason: 'provider_not_allowed' })
    expect(checkFeatureModel('lesson_tutor', 'assemblyai', 'universal-2')).toMatchObject({ blocked: true })
  })

  it('HARD-blocks stt / realtime features on models of the wrong shape', () => {
    expect(checkFeatureModel('speech_stt', 'openai', 'gpt-5')).toMatchObject({ blocked: true, reason: 'not_a_speech_model' })
    expect(checkFeatureModel('speech_stt', 'openai', 'whisper-1')).toMatchObject({ ok: true, blocked: false })
    expect(checkFeatureModel('speech_stt', 'assemblyai', 'universal-2')).toMatchObject({ ok: true })
    expect(checkFeatureModel('voice_conversation', 'openai', 'gpt-5')).toMatchObject({ blocked: true, reason: 'not_a_realtime_model' })
    expect(checkFeatureModel('voice_conversation', 'openai', 'gpt-realtime')).toMatchObject({ ok: true })
  })

  it('only WARNS for language / object features and image models', () => {
    const noTools = checkFeatureModel('lesson_tutor', 'deepseek', 'deepseek-chat', { language: true })
    expect(noTools).toMatchObject({ ok: false, blocked: false, missing: ['tools'] })

    const noStructured = checkFeatureModel('exam_grader', 'groq', 'llama-3.3-70b-versatile')
    expect(noStructured.blocked).toBe(false)
    expect(noStructured.missing).toEqual(['structured'])

    expect(checkFeatureModel('image_generation', 'openai', 'some-new-image-model')).toMatchObject({ ok: false, blocked: false })
    expect(checkFeatureModel('image_generation', 'openai', 'gpt-image-1')).toMatchObject({ ok: true })
  })

  it('accepts a capable model silently and prefers provider-reported caps', () => {
    expect(checkFeatureModel('exam_grader', 'openai', 'gpt-5.1')).toMatchObject({ ok: true, blocked: false, missing: [] })
    expect(
      checkFeatureModel('exam_grader', 'openai', 'gpt-5.1', { language: true, structured: false }),
    ).toMatchObject({ ok: false, missing: ['structured'] })
  })

  it('every provider id has capability rules', () => {
    for (const id of PROVIDER_IDS) expect(() => inferModelCaps(id, 'x')).not.toThrow()
  })
})
