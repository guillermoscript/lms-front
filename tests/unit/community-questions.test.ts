import { describe, it, expect } from 'vitest'
import {
  acceptAnswerErrorKey,
  canAcceptAnswers,
  matchesQuestionFilter,
  parseQuestionFilter,
  rankAnswers,
} from '@/lib/community/questions'

/**
 * Questions with an accepted answer (#875). The rule itself is enforced by the
 * database (tests/sql/issue-875-community-questions.sql); these pin the UI's
 * mirror of it and the thread's ordering.
 */

describe('parseQuestionFilter', () => {
  it('accepts the three filters', () => {
    expect(parseQuestionFilter('questions')).toBe('questions')
    expect(parseQuestionFilter('unanswered')).toBe('unanswered')
    expect(parseQuestionFilter(['answered', 'questions'])).toBe('answered')
  })

  it('ignores anything else', () => {
    expect(parseQuestionFilter(undefined)).toBeNull()
    expect(parseQuestionFilter(null)).toBeNull()
    expect(parseQuestionFilter('')).toBeNull()
    expect(parseQuestionFilter('UNANSWERED')).toBeNull()
    expect(parseQuestionFilter("unanswered'),or(")).toBeNull()
  })
})

describe('matchesQuestionFilter', () => {
  const open = { post_type: 'question', accepted_comment_id: null }
  const done = { post_type: 'question', accepted_comment_id: 'c1' }
  const plain = { post_type: 'standard', accepted_comment_id: null }

  it('no filter keeps everything', () => {
    expect([open, done, plain].every((p) => matchesQuestionFilter(p, null))).toBe(true)
  })

  it('narrows to questions, then by answer', () => {
    expect([open, done, plain].filter((p) => matchesQuestionFilter(p, 'questions'))).toEqual([open, done])
    expect([open, done, plain].filter((p) => matchesQuestionFilter(p, 'unanswered'))).toEqual([open])
    expect([open, done, plain].filter((p) => matchesQuestionFilter(p, 'answered'))).toEqual([done])
  })
})

describe('rankAnswers', () => {
  const c = (id: string, created_at: string, helpful_count: number) => ({ id, created_at, helpful_count })
  const early = c('early', '2026-09-01T10:00:00Z', 0)
  const helpful = c('helpful', '2026-09-01T12:00:00Z', 3)
  const late = c('late', '2026-09-01T11:00:00Z', 0)
  const accepted = c('accepted', '2026-09-01T13:00:00Z', 1)

  it('puts the accepted answer first, then most helpful, then oldest', () => {
    const ranked = rankAnswers([early, helpful, late, accepted], { isQuestion: true, acceptedCommentId: 'accepted' })
    expect(ranked.map((r) => r.id)).toEqual(['accepted', 'helpful', 'early', 'late'])
  })

  it('without an accepted answer ranks by helpful then date', () => {
    const ranked = rankAnswers([late, early, helpful], { isQuestion: true, acceptedCommentId: null })
    expect(ranked.map((r) => r.id)).toEqual(['helpful', 'early', 'late'])
  })

  it('leaves any other post chronological and does not mutate', () => {
    const input = [early, helpful, late]
    expect(rankAnswers(input, { isQuestion: false, acceptedCommentId: 'late' })).toBe(input)
    rankAnswers(input, { isQuestion: true, acceptedCommentId: null })
    expect(input.map((r) => r.id)).toEqual(['early', 'helpful', 'late'])
  })
})

describe('canAcceptAnswers', () => {
  it('the asker and staff, nobody else', () => {
    expect(canAcceptAnswers({ viewerId: 'a', viewerRole: 'student', questionAuthorId: 'a' })).toBe(true)
    expect(canAcceptAnswers({ viewerId: 't', viewerRole: 'teacher', questionAuthorId: 'a' })).toBe(true)
    expect(canAcceptAnswers({ viewerId: 'x', viewerRole: 'admin', questionAuthorId: 'a' })).toBe(true)
    expect(canAcceptAnswers({ viewerId: 'b', viewerRole: 'student', questionAuthorId: 'a' })).toBe(false)
    expect(canAcceptAnswers({ viewerId: 'b', viewerRole: null, questionAuthorId: 'a' })).toBe(false)
  })
})

describe('acceptAnswerErrorKey', () => {
  it('maps the trigger refusals by SQLSTATE, never by message', () => {
    expect(acceptAnswerErrorKey({ code: '42501', message: 'anything' })).toBe('acceptNotAllowed')
    expect(acceptAnswerErrorKey({ code: '23514' })).toBe('acceptInvalid')
    expect(acceptAnswerErrorKey({ code: '08006', message: 'community_accept_not_allowed' })).toBeNull()
    expect(acceptAnswerErrorKey(null)).toBeNull()
  })
})
