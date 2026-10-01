import { describe, expect, it } from 'vitest'
import { communityXpEarned } from '@/lib/community/xp'

const NOW = '2026-09-29T12:00:00.123456+00:00'
const EARLIER = '2026-09-28T09:00:00+00:00'

describe('communityXpEarned (#874)', () => {
  it('sums what this insert earned', () => {
    expect(communityXpEarned([{ action_type: 'community_post', xp_amount: 5, created_at: NOW }], NOW)).toEqual({
      amount: 5,
      action: 'community_post',
    })
  })

  it('earns nothing past a cap', () => {
    expect(communityXpEarned([], NOW)).toEqual({ amount: 0, action: null })
  })

  it('ignores a prompt answer earned before a delete + repost', () => {
    const rows = [
      { action_type: 'community_prompt_answer', xp_amount: 15, created_at: EARLIER },
      { action_type: 'community_comment', xp_amount: 3, created_at: NOW },
    ]
    expect(communityXpEarned(rows, NOW)).toEqual({ amount: 3, action: 'community_comment' })
  })

  it('names the prompt answer when it is earned now', () => {
    const rows = [{ action_type: 'community_prompt_answer', xp_amount: 15, created_at: NOW }]
    expect(communityXpEarned(rows, NOW)).toEqual({ amount: 15, action: 'community_prompt_answer' })
  })

  it('ignores non-community action types', () => {
    const rows = [{ action_type: 'lesson_completion', xp_amount: 100, created_at: NOW }]
    expect(communityXpEarned(rows, NOW).amount).toBe(0)
  })
})
