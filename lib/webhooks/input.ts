import { normalizeSubscribedEvents, type WebhookScope } from './events'
import { parseWebhookUrl } from './url-rules'

export type WebhookField = 'name' | 'url' | 'events'

export type ParsedEndpointInput =
  | { ok: true; value: { name: string; url: string; events: string[] } }
  | { ok: false; fields: WebhookField[]; reason?: 'insecure_url' | 'blocked_host' | 'invalid_url' }

/** Shared by the form (instant feedback) and the server action (authority). */
export function parseEndpointInput(scope: WebhookScope, raw: unknown): ParsedEndpointInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const fields: WebhookField[] = []

  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (name.length < 1 || name.length > 80) fields.push('name')

  let url = ''
  let reason: 'insecure_url' | 'blocked_host' | 'invalid_url' | undefined
  if (typeof o.url === 'string' && o.url.trim().length <= 2048) {
    const guard = parseWebhookUrl(o.url)
    if (guard.ok) url = guard.url.toString()
    else {
      fields.push('url')
      reason = guard.reason
    }
  } else {
    fields.push('url')
    reason = 'invalid_url'
  }

  const events = normalizeSubscribedEvents(scope, o.events)
  if (!events) fields.push('events')

  if (fields.length > 0 || !events) return { ok: false, fields, reason }
  return { ok: true, value: { name, url, events } }
}
