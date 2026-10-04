import { describe, it, expect } from 'vitest'
import {
  CONVERSATION_DEFAULTS,
  CONVERSATION_TOOLS,
  FINISH_CONVERSATION_TOOL,
  GIVE_HINT_TOOL,
  NOTE_CORRECTION_TOOL,
  CONVERSATION_TAB_KEY,
  ConversationNotesSchema,
  MAX_CONVERSATION_MINUTES,
  buildConversationGraderPrompt,
  buildConversationInstructions,
  conversationOverran,
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
    expect(text).toContain(GIVE_HINT_TOOL)
  })

  it('the grader writes feedback in the native language and grades to level', () => {
    const text = buildConversationGraderPrompt(exercise, config)
    expect(text).toContain('in Spanish')
    expect(text).toContain('relative to level A1')
  })

  it('the tutor can end the call, and the tool carries no verdict', () => {
    expect(buildConversationInstructions(exercise, config)).toContain(FINISH_CONVERSATION_TOOL)
    const tool = CONVERSATION_TOOLS.find((t) => t.name === FINISH_CONVERSATION_TOOL)
    // Realtime tools run in the student's browser: a score/passed parameter
    // here would be a forgeable pass. Grading stays in the evaluate route.
    expect(Object.keys(tool!.parameters.properties)).toEqual(['reason'])
  })

  it('no tool can report a score, a pass or a level', () => {
    const allowed: Record<string, string[]> = {
      [FINISH_CONVERSATION_TOOL]: ['reason'],
      [GIVE_HINT_TOOL]: ['hint'],
      [NOTE_CORRECTION_TOOL]: ['said', 'better'],
    }
    expect(CONVERSATION_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(allowed).sort())
    for (const t of CONVERSATION_TOOLS) {
      expect(Object.keys(t.parameters.properties)).toEqual(allowed[t.name])
    }
  })

  it('logged mistakes reach the grader as leads to verify, not as facts', () => {
    const text = buildConversationGraderPrompt(exercise, config, [{ said: 'I have 20 years', better: 'I am 20' }])
    expect(text).toContain('"I have 20 years" → "I am 20"')
    expect(text).toContain('ONLY if the transcript shows')
    expect(buildConversationGraderPrompt(exercise, config)).not.toContain('possible mistakes')
  })

  it('notes are bounded, and a tab key is a plain token', () => {
    expect(ConversationNotesSchema.safeParse(Array(31).fill({ said: 'a', better: 'b' })).success).toBe(false)
    expect(ConversationNotesSchema.safeParse([{ said: 'a', better: 'b', score: 100 }]).data).toEqual([{ said: 'a', better: 'b' }])
    expect(CONVERSATION_TAB_KEY.test('V1StGXR8_Z5jdHi6')).toBe(true)
    expect(CONVERSATION_TAB_KEY.test("x' or 1=1")).toBe(false)
  })
})

describe('conversationOverran', () => {
  it('allows the budget plus the slack a normal hang-up needs', () => {
    expect(conversationOverran(5 * 60, 5)).toBe(false)
    expect(conversationOverran(5 * 60 + 60, 5)).toBe(false)
  })

  it('refuses a session kept open past the countdown', () => {
    expect(conversationOverran(5 * 60 + 61, 5)).toBe(true)
    expect(conversationOverran(30 * 60, 1)).toBe(true)
  })
})
