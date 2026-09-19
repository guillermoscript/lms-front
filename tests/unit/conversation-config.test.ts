import { describe, it, expect } from 'vitest'
import {
  CONVERSATION_DEFAULTS,
  MAX_CONVERSATION_MINUTES,
  buildConversationGraderPrompt,
  buildConversationInstructions,
  parseConversationConfig,
} from '@/lib/speech/conversation'

describe('parseConversationConfig', () => {
  it('falls back to defaults for a missing or malformed config', () => {
    expect(parseConversationConfig(null)).toEqual(CONVERSATION_DEFAULTS)
    expect(parseConversationConfig('nope')).toEqual(CONVERSATION_DEFAULTS)
  })

  it('caps minutes — realtime audio is billed by the minute', () => {
    expect(parseConversationConfig({ max_minutes: 999 }).max_minutes).toBe(MAX_CONVERSATION_MINUTES)
    expect(parseConversationConfig({ max_minutes: 0 }).max_minutes).toBe(1)
  })

  it('rejects a voice, level or language it does not know', () => {
    const config = parseConversationConfig({ voice: 'x"; drop', level: 'Z9', target_language: 'english' })
    expect(config.voice).toBe(CONVERSATION_DEFAULTS.voice)
    expect(config.level).toBe(CONVERSATION_DEFAULTS.level)
    expect(config.target_language).toBe(CONVERSATION_DEFAULTS.target_language)
  })

  it('keeps 0 daily attempts, which means unlimited', () => {
    expect(parseConversationConfig({ max_daily_attempts: 0 }).max_daily_attempts).toBe(0)
  })
})

describe('conversation prompts', () => {
  const exercise = { title: 'Order a coffee', instructions: 'Order and pay.' }
  const config = parseConversationConfig({ scenario: 'You are a barista.', level: 'A1' })

  it('the tutor speaks the target language and hints in the native one', () => {
    const text = buildConversationInstructions(exercise, config)
    expect(text).toContain('English conversation partner for a Spanish-speaking student at CEFR level A1')
    expect(text).toContain('You are a barista.')
    expect(text).toContain('brief hint in Spanish')
  })

  it('the grader writes feedback in the native language and grades to level', () => {
    const text = buildConversationGraderPrompt(exercise, config)
    expect(text).toContain('in Spanish')
    expect(text).toContain('relative to level A1')
  })
})
