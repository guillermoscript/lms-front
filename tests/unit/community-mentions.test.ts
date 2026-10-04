import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import { CommunityMarkdown } from '@/components/community/community-markdown'
import {
  extractMentionIds,
  findMentionQuery,
  formatMentionToken,
  insertMention,
  mentionsToPlainText,
  parseMentionHref,
  sanitizeMentionName,
} from '@/lib/community/mentions'
import {
  feedInsertFilter,
  isFeedInsertSignal,
  isThreadInsertSignal,
  mergePendingPosts,
  newestCreatedAt,
  threadInsertFilter,
  unseenLivePosts,
} from '@/lib/community/realtime'
import {
  communityNotificationHref,
  communityNotificationMessage,
  communityNotificationPostLine,
  communityNotificationSnippet,
  parseCommunityNotificationMeta,
} from '@/lib/community/notifications'
import type { CommunityPost } from '@/components/community/community-feed'

// #876: @mentions and the live feed.

const ANA = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0'
const BEN = '11111111-2222-4333-8444-555555555555'
const POST = '87600000-0000-4000-8000-000000000101'
const COMMENT = '87600000-0000-4000-8000-000000000201'
const TENANT = '00000000-0000-0000-0000-000000000002'
const VIEWER = 'a1000000-0000-0000-0000-000000000004'

describe('mention tokens', () => {
  it('formats the composer form the database parses', () => {
    expect(formatMentionToken('Ana Pérez', ANA)).toBe(`[@Ana Pérez](mention:${ANA})`)
    expect(formatMentionToken('Ana', ANA.toUpperCase())).toBe(`[@Ana](mention:${ANA})`)
  })

  it('strips what would end the link early, and refuses what can not be a mention', () => {
    expect(sanitizeMentionName('  Ana ](evil)\\ [x]\n  Pérez ')).toBe('Ana evil x Pérez')
    expect(sanitizeMentionName('x'.repeat(150))).toHaveLength(100)
    expect(formatMentionToken('[]()', ANA)).toBeNull()
    expect(formatMentionToken('Ana', 'not-a-uuid')).toBeNull()
  })

  it('extracts distinct ids in order, capped like community_parse_mentions', () => {
    const text = `hi ${formatMentionToken('Ben', BEN)} and ${formatMentionToken('Ana', ANA)} again ${formatMentionToken('B', BEN)}`
    expect(extractMentionIds(text)).toEqual([BEN, ANA])
    expect(extractMentionIds(text, 1)).toEqual([BEN])
    // only the exact form counts
    expect(extractMentionIds(`@Ana [Ana](mention:${ANA}) [@x](https://evil.test) [@y](mention:nope)`)).toEqual([])
  })

  it('reads mention hrefs, nothing else', () => {
    expect(parseMentionHref(`mention:${ANA}`)).toBe(ANA)
    expect(parseMentionHref(`MENTION:${ANA.toUpperCase()}`)).toBe(ANA)
    expect(parseMentionHref('mention:javascript:alert(1)')).toBeNull()
    expect(parseMentionHref('https://example.com')).toBeNull()
    expect(parseMentionHref(undefined)).toBeNull()
  })

  it('turns tokens into plain "@Name" text', () => {
    expect(mentionsToPlainText(`ping ${formatMentionToken('Ana', ANA)}!`)).toBe('ping @Ana!')
  })
})

describe('mention autocomplete', () => {
  it('finds the @query right before the caret', () => {
    expect(findMentionQuery('@', 1)).toEqual({ query: '', start: 0 })
    expect(findMentionQuery('hi @an', 6)).toEqual({ query: 'an', start: 3 })
    expect(findMentionQuery('(@an', 4)).toEqual({ query: 'an', start: 1 })
    expect(findMentionQuery('hi @ana pérez', 13)).toBeNull() // a space ends it
    expect(findMentionQuery('me@school.test', 14)).toBeNull() // an email is not a mention
    expect(findMentionQuery('hi @an', 2)).toBeNull()
    expect(findMentionQuery('hi', -1)).toBeNull()
  })

  it('replaces the @query with the token and puts the caret after it', () => {
    const text = 'hey @an how are you'
    const { text: next, caret } = insertMention(text, { start: 4, caret: 7 }, { id: ANA, name: 'Ana Pérez' })
    const token = `[@Ana Pérez](mention:${ANA})`
    expect(next).toBe(`hey ${token} how are you`)
    expect(caret).toBe(4 + token.length + 1)
    // at the end of the text a space is added
    expect(insertMention('@an', { start: 0, caret: 3 }, { id: ANA, name: 'Ana' }).text).toBe(`[@Ana](mention:${ANA}) `)
    // a candidate that can not be a token changes nothing
    expect(insertMention('@an', { start: 0, caret: 3 }, { id: 'x', name: 'Ana' })).toEqual({ text: '@an', caret: 3 })
  })
})

function render(content: string): string {
  // children via props: createElement's overload requires it for this provider's type
  // eslint-disable-next-line react/no-children-prop
  const provider = createElement(NextIntlClientProvider, {
    locale: 'en',
    messages: en,
    timeZone: 'UTC',
    children: createElement(CommunityMarkdown, { content }),
  })
  return renderToStaticMarkup(provider)
}

describe('CommunityMarkdown mentions', () => {
  it('renders a mention as a highlighted name, not a link', () => {
    const html = render(`thanks ${formatMentionToken('Ana Pérez', ANA)}!`)
    expect(html).toContain('data-mention=""')
    expect(html).toContain('@Ana Pérez')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('mention:')
  })

  it('still empties dangerous hrefs next to a mention', () => {
    const html = render(`${formatMentionToken('Ana', ANA)} [x](javascript:alert(1)) [y](mention:javascript:alert(1))`)
    expect(html).not.toMatch(/javascript:/i)
    expect(html).toContain('data-mention=""')
  })
})

describe('live feed filters', () => {
  it('narrows every channel, and never widens a malformed one', () => {
    expect(feedInsertFilter({ scope: 'school', tenantId: TENANT })).toBe(`tenant_id=eq.${TENANT}`)
    expect(feedInsertFilter({ scope: 'course', tenantId: TENANT, courseId: 2001 })).toBe('course_id=eq.2001')
    expect(feedInsertFilter({ scope: 'course', tenantId: TENANT })).toBeNull()
    expect(feedInsertFilter({ scope: 'course', tenantId: TENANT, courseId: 1.5 })).toBeNull()
    expect(feedInsertFilter({ scope: 'school', tenantId: 'x,tenant_id=neq.y' })).toBeNull()
    expect(feedInsertFilter({ scope: 'school', tenantId: null })).toBeNull()
    expect(threadInsertFilter(POST)).toBe(`post_id=eq.${POST}`)
    expect(threadInsertFilter('1 or 1=1')).toBeNull()
  })

  it('only someone else\'s post in this feed is a signal', () => {
    const row = { id: POST, author_id: BEN, course_id: null, tenant_id: TENANT }
    expect(isFeedInsertSignal(row, { scope: 'school', viewerId: VIEWER })).toBe(true)
    expect(isFeedInsertSignal({ ...row, author_id: VIEWER }, { scope: 'school', viewerId: VIEWER })).toBe(false)
    // the tenant filter also delivers course posts; the school feed ignores them
    expect(isFeedInsertSignal({ ...row, course_id: 2001 }, { scope: 'school', viewerId: VIEWER })).toBe(false)
    expect(isFeedInsertSignal({ ...row, course_id: 2001 }, { scope: 'course', courseId: 2001, viewerId: VIEWER })).toBe(true)
    expect(isFeedInsertSignal({ ...row, course_id: 2002 }, { scope: 'course', courseId: 2001, viewerId: VIEWER })).toBe(false)
    expect(isFeedInsertSignal(null, { scope: 'school', viewerId: VIEWER })).toBe(false)
    expect(isFeedInsertSignal({ id: 'x' }, { scope: 'school', viewerId: VIEWER })).toBe(false)
  })

  it('a thread reloads for someone else\'s comment on it', () => {
    expect(isThreadInsertSignal({ id: COMMENT, post_id: POST, author_id: BEN }, { postId: POST, viewerId: VIEWER })).toBe(true)
    expect(isThreadInsertSignal({ id: COMMENT, post_id: POST, author_id: VIEWER }, { postId: POST, viewerId: VIEWER })).toBe(false)
    expect(isThreadInsertSignal({ id: COMMENT, post_id: BEN, author_id: BEN }, { postId: POST, viewerId: VIEWER })).toBe(false)
  })
})

function post(id: string, createdAt: string, authorId = BEN): CommunityPost {
  return { id, author_id: authorId, created_at: createdAt } as CommunityPost
}

describe('pending posts', () => {
  it('finds the newest date', () => {
    expect(newestCreatedAt([])).toBeNull()
    expect(newestCreatedAt([post('a', '2026-10-01T10:00:00Z'), null, post('b', '2026-10-01T11:00:00+00:00')])).toBe(
      '2026-10-01T11:00:00+00:00'
    )
  })

  it('merges what arrived with what was waiting: each once, newest first, never shown twice or the viewer\'s own', () => {
    const waiting = [post('b', '2026-10-01T10:05:00Z')]
    const incoming = [
      post('c', '2026-10-01T10:10:00Z'),
      post('b', '2026-10-01T10:05:00Z'),
      post('a', '2026-10-01T10:00:00Z'),
      post('mine', '2026-10-01T10:11:00Z', VIEWER),
    ]
    const merged = mergePendingPosts(waiting, incoming, { shownIds: new Set(['a']), viewerId: VIEWER })
    expect(merged.map((p) => p.id)).toEqual(['c', 'b'])
  })

  it('drops live posts once the server page holds them', () => {
    const live = [post('c', '2026-10-01T10:10:00Z'), post('b', '2026-10-01T10:05:00Z')]
    expect(unseenLivePosts(live, [post('c', '2026-10-01T10:10:00Z')]).map((p) => p.id)).toEqual(['b'])
    expect(unseenLivePosts([], [post('c', 'x')])).toEqual([])
  })
})

describe('community_mention notifications', () => {
  const metadata = {
    kind: 'community_mention',
    mention_id: 'e7c3d1a2-0000-4000-8000-000000000001',
    target: 'comment',
    post_id: POST,
    course_id: 2001,
    lesson_id: null,
    comment_id: COMMENT,
    actor_id: BEN,
    actor_name: 'Ben',
    actor_role: 'student',
    snippet: 'cc @Ana look',
    post_label: 'Loops',
  }

  it('parses and names who mentioned the reader, and where', () => {
    const meta = parseCommunityNotificationMeta(metadata)!
    expect(meta).toMatchObject({ kind: 'community_mention', target: 'comment', commentId: COMMENT, actorName: 'Ben' })
    expect(communityNotificationMessage(meta, 'Someone')).toEqual({ key: 'mentionInComment', values: { name: 'Ben' } })
    const inPost = parseCommunityNotificationMeta({ ...metadata, target: 'post', comment_id: null })!
    expect(communityNotificationMessage(inPost, 'Someone')).toEqual({ key: 'mentionInPost', values: { name: 'Ben' } })
    expect(communityNotificationSnippet(meta, 'Someone')).toEqual({ name: 'Ben', snippet: 'cc @Ana look' })
    expect(communityNotificationPostLine(meta)).toEqual({ key: 'onPost', values: { post: 'Loops' } })
  })

  it('links to the exact comment, or the post', () => {
    const meta = parseCommunityNotificationMeta(metadata)!
    expect(communityNotificationHref(meta, 'student')).toBe(
      `/dashboard/student/courses/2001/community?post=${POST}#comment-${COMMENT}`
    )
    const inPost = parseCommunityNotificationMeta({ ...metadata, target: 'post', comment_id: null, course_id: null })!
    expect(communityNotificationHref(inPost, 'admin')).toBe(`/dashboard/admin/community?post=${POST}`)
  })

  it('once the comment was taken back, quotes nothing and names nobody', () => {
    const scrubbed = { ...metadata }
    for (const k of ['comment_id', 'actor_id', 'actor_name', 'actor_role', 'snippet'] as const) delete scrubbed[k as keyof typeof scrubbed]
    const meta = parseCommunityNotificationMeta(scrubbed)!
    expect(communityNotificationSnippet(meta, 'Someone')).toBeNull()
    expect(communityNotificationMessage(meta, 'Someone')).toEqual({ key: 'mentionInComment', values: { name: 'Someone' } })
  })
})

describe('#876 copy', () => {
  it.each([
    ['en', en],
    ['es', es],
  ])('%s has every new string', (_lang, messages) => {
    const c = messages.community as Record<string, unknown> & {
      notifications: Record<string, unknown> & { preferences: Record<string, unknown> }
      mentions: Record<string, unknown>
    }
    expect(typeof c.newPosts).toBe('string')
    expect(typeof c.mentions.listLabel).toBe('string')
    expect(typeof c.mentions.noMatches).toBe('string')
    expect(typeof c.notifications.mentionInPost).toBe('string')
    expect(typeof c.notifications.mentionInComment).toBe('string')
    expect(typeof c.notifications.preferences.mentions).toBe('string')
    expect(typeof c.notifications.preferences.mentionsDescription).toBe('string')
  })
})
