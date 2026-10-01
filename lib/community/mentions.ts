/**
 * @mentions in community text (#876). Pure and client-safe.
 *
 * A mention is stored as markdown the composer writes:
 *
 *   [@Ana Pérez](mention:0f1e…)
 *
 * The web renders it as a highlighted name (community-markdown.tsx); any other
 * markdown renderer shows the link text "@Ana Pérez". The DATABASE decides who
 * was really mentioned — `community_parse_mentions()` reads the same form, and
 * only members who can see the post are recorded and notified
 * (20261001150000_community_realtime_mentions_876.sql). This module and that
 * function must agree on the form; tests/unit/community-mentions.test.ts pins it.
 */

export const MENTION_SCHEME = 'mention:'

/** Mirrors the SQL cap: at most this many people per post or comment. */
export const MAX_MENTIONS_PER_TEXT = 10

/** At most this many autocomplete candidates (the RPC caps it too). */
export const MENTION_CANDIDATE_LIMIT = 8

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same shape as the SQL regex: `[@` + 1–100 chars without `]` or a newline +
// `](mention:<uuid>)`.
const TOKEN = /\[@[^\]\n]{1,100}\]\(mention:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi

export interface MentionCandidate {
  id: string
  name: string
  avatarUrl: string | null
  role: 'student' | 'teacher' | 'admin' | null
}

/** The user id in a `mention:<uuid>` href, else null. */
export function parseMentionHref(href: string | null | undefined): string | null {
  if (!href || !href.toLowerCase().startsWith(MENTION_SCHEME)) return null
  const id = href.slice(MENTION_SCHEME.length)
  return UUID.test(id) ? id.toLowerCase() : null
}

/**
 * A display name made safe for the token: no brackets, parentheses or
 * backslashes (they would end the link early) and no newlines, at most 100
 * characters. Empty when nothing is left.
 */
export function sanitizeMentionName(name: string): string {
  return name
    .replace(/[[\]()\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim()
}

/** The markdown for mentioning `userId` as `name`, or null when it can not be one. */
export function formatMentionToken(name: string, userId: string): string | null {
  const safe = sanitizeMentionName(name)
  if (!safe || !UUID.test(userId)) return null
  return `[@${safe}](${MENTION_SCHEME}${userId.toLowerCase()})`
}

/** The distinct user ids a text mentions, in order, capped like the database. */
export function extractMentionIds(content: string, max = MAX_MENTIONS_PER_TEXT): string[] {
  const ids: string[] = []
  for (const match of content.matchAll(TOKEN)) {
    const id = match[1].toLowerCase()
    if (!ids.includes(id)) ids.push(id)
    if (ids.length >= max) break
  }
  return ids
}

/** Tokens rewritten to "@Name" — for anything that shows text without markdown. */
export function mentionsToPlainText(content: string): string {
  return content.replace(/\[(@[^\]\n]{1,100})\]\(mention:[0-9a-f-]{36}\)/gi, '$1')
}

/** What the reader is typing after `@`, at most this long. */
const QUERY = /(^|[\s(])@([^\s@[\]()]{0,30})$/u

/**
 * The `@query` being typed at `caret`, or null when the caret is not right
 * after one. `start` is where the `@` is. An `@` inside a word (an email
 * address) does not count.
 */
export function findMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  if (caret < 0 || caret > text.length) return null
  const match = QUERY.exec(text.slice(0, caret))
  if (!match) return null
  const start = caret - match[2].length - 1
  return { query: match[2], start }
}

/**
 * Replace the `@query` between `start` and `caret` with the candidate's token
 * and a trailing space. Returns the new text and where the caret goes; the
 * text unchanged when the candidate can not be a token.
 */
export function insertMention(
  text: string,
  { start, caret }: { start: number; caret: number },
  candidate: Pick<MentionCandidate, 'id' | 'name'>
): { text: string; caret: number } {
  const token = formatMentionToken(candidate.name, candidate.id)
  if (!token) return { text, caret }
  const after = text.slice(caret)
  const glue = after.startsWith(' ') ? '' : ' '
  const next = `${text.slice(0, start)}${token}${glue}${after}`
  return { text: next, caret: start + token.length + 1 }
}
