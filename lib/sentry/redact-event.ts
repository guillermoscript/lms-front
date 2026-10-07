import { redact } from '@/lib/ai/byok/redact-core'

/**
 * Scrubs provider API keys / bearer tokens out of a Sentry event before it
 * leaves the process (BYOK, issue: bring-your-own AI keys). A tenant's key is
 * decrypted only inside a request closure, but the provider's own error text
 * ("Incorrect API key provided: sk-...") or a stray header on a captured
 * request can still carry one into an exception message, breadcrumb or
 * `extra`. This is the backstop, not the plan: call sites already log only
 * `err.name`, `status` and `redact(err.message)`.
 *
 * Walks every string in the event (message, exception values, breadcrumbs,
 * request, extra, contexts) with `redact()`, and blanks the value of any
 * key that is itself a credential name (`authorization`, `x-api-key`, ...).
 * Pure and structural, so it runs unchanged in the node and edge configs and
 * in unit tests. Mutates and returns the same event: Sentry's `beforeSend`
 * contract.
 */

const SENSITIVE_KEY = /^(?:authorization|proxy-authorization|x-api-key|x-goog-api-key|api[-_]?key|apikey|xi-api-key)$/i
const MASK = '[REDACTED]'
const MAX_DEPTH = 10

function scrub(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redact(value)
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value
  if (seen.has(value)) return value
  seen.add(value)

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrub(value[i], depth + 1, seen)
    return value
  }

  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (SENSITIVE_KEY.test(key) && record[key] != null && record[key] !== '') {
      record[key] = MASK
    } else {
      record[key] = scrub(record[key], depth + 1, seen)
    }
  }
  return value
}

export function redactSentryEvent<T extends object>(event: T): T {
  try {
    scrub(event, 0, new WeakSet())
  } catch {
    // A scrubber that throws would drop the event; the walk only reads plain data, so this is paranoia.
  }
  return event
}
