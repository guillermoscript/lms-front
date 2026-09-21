/**
 * Push delivery (Expo Push Service) for fanned-out `user_notifications` rows
 * (issue #835). Run every minute by `/api/cron/send-pushes`.
 *
 * Tenant-agnostic by design: it only delivers rows some writer (server action,
 * cron, SQL trigger) already addressed to a user, so it never decides who gets
 * what. `claim_pending_pushes()` marks the rows sent in the same statement that
 * picks them — overlapping runs never double-send, and a failed Expo call is
 * not retried (at-most-once). Users who set `notification_preferences.
 * push_enabled = false` or have no device are claimed with no token.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
/** Expo accepts at most 100 recipients per request. */
export const EXPO_CHUNK_SIZE = 100
/** Notifications claimed per run; the rest wait for the next minute. */
export const MAX_NOTIFICATIONS_PER_RUN = 25
/** Older pending rows are marked sent without a push — stale news is noise. */
export const MAX_PENDING_AGE = '1 day'

const MAX_BODY_LENGTH = 170

export interface ClaimedPush {
  notification_id: number
  title: string
  content: string
  priority: string
  url: string | null
  recipients: number
  tokens: string[]
}

interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

export interface SendPushesResult {
  notifications: number
  recipients: number
  devices: number
  sent: number
  pruned_tokens: number
  errors: string[]
}

export interface SendPushesOptions {
  fetch?: typeof fetch
  expoUrl?: string
}

export function truncatePushBody(content: string): string {
  return content.length > MAX_BODY_LENGTH ? `${content.slice(0, MAX_BODY_LENGTH - 3)}...` : content
}

export async function sendPendingPushes(
  admin: SupabaseClient,
  options: SendPushesOptions = {}
): Promise<SendPushesResult> {
  const doFetch = options.fetch ?? fetch
  const expoUrl = options.expoUrl ?? (process.env.EXPO_PUSH_URL || DEFAULT_EXPO_PUSH_URL)

  const { data, error } = await admin.rpc('claim_pending_pushes', {
    _max_notifications: MAX_NOTIFICATIONS_PER_RUN,
    _max_age: MAX_PENDING_AGE,
  })
  if (error) throw error
  const claimed = (data ?? []) as ClaimedPush[]

  const result: SendPushesResult = {
    notifications: claimed.length,
    recipients: 0,
    devices: 0,
    sent: 0,
    pruned_tokens: 0,
    errors: [],
  }

  for (const push of claimed) {
    result.recipients += push.recipients
    result.devices += push.tokens.length

    const message = {
      title: push.title,
      body: truncatePushBody(push.content),
      data: { notification_id: push.notification_id, url: push.url ?? null },
      sound: 'default',
      priority: ['high', 'urgent'].includes(push.priority) ? 'high' : 'default',
    }

    for (let i = 0; i < push.tokens.length; i += EXPO_CHUNK_SIZE) {
      const chunk = push.tokens.slice(i, i + EXPO_CHUNK_SIZE)
      let tickets: ExpoPushTicket[]
      try {
        const res = await doFetch(expoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...message, to: chunk }),
        })
        if (!res.ok) {
          result.errors.push(`notification ${push.notification_id}: Expo ${res.status} ${await res.text()}`)
          continue
        }
        tickets = ((await res.json()) as { data?: ExpoPushTicket[] }).data ?? []
      } catch (err) {
        result.errors.push(`notification ${push.notification_id}: ${err instanceof Error ? err.message : String(err)}`)
        continue
      }

      // Tickets come back in the same order as the tokens sent.
      const dead: string[] = []
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          result.sent++
        } else {
          if (ticket.details?.error === 'DeviceNotRegistered' && chunk[idx]) dead.push(chunk[idx])
          if (ticket.message) result.errors.push(ticket.message)
        }
      })

      if (dead.length) {
        const { error: pruneError } = await admin.from('device_push_tokens').delete().in('token', dead)
        if (pruneError) result.errors.push(`prune: ${pruneError.message}`)
        else result.pruned_tokens += dead.length
      }
    }
  }

  return result
}
