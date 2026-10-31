import { describe, expect, it } from 'vitest'
import { liveTurns } from '@/lib/speech/live-turns'
import { buildConversationInstructions, parseConversationConfig } from '@/lib/speech/conversation'

describe('liveTurns', () => {
  it('orders fragments by start time and joins runs of one speaker', () => {
    const turns = liveTurns([
      { speaker: 'user', delta: ' where is', startMs: 3000 },
      { speaker: 'assistant', delta: 'Hi! ', startMs: 0 },
      { speaker: 'assistant', delta: 'Welcome.', startMs: 800 },
      { speaker: 'user', delta: ' the milk?', startMs: 3400 },
    ])
    expect(turns).toEqual([
      { role: 'assistant', text: 'Hi! Welcome.' },
      { role: 'user', text: 'where is the milk?' },
    ])
  })

  it('drops empty turns', () => {
    expect(liveTurns([{ speaker: 'user', delta: '  ', startMs: 0 }])).toEqual([])
  })
})

describe('buildConversationInstructions for GPT-Live', () => {
  const config = parseConversationConfig({})
  const exercise = { title: 'Shop', instructions: null }

  it('keeps tool lines for the WebSocket tutor only', () => {
    expect(buildConversationInstructions(exercise, config)).toContain('tool')
    const live = buildConversationInstructions(exercise, config, { live: true })
    expect(live).not.toMatch(/tool/i)
    expect(live).toContain('the student ends the call themselves')
  })
})
