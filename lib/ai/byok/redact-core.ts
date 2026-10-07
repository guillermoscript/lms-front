/**
 * Implementation of `redact`. App code imports `@/lib/ai/byok/redact` (server-only);
 * this file exists so Sentry's `instrumentation` configs, which run outside the
 * route graph, can use the same patterns without tripping `server-only`.
 *
 * Masks anything shaped like a provider API key / bearer token in a string,
 * for logs, Sentry events and error messages. Pure string transform; safe on
 * arbitrary input. Order matters: specific prefixes before the generic `sk-`.
 */
const MASK = '[REDACTED]'

const PATTERNS: RegExp[] = [
  // Authorization: Bearer xxx  /  bare "Bearer xxx"
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // Anthropic, OpenRouter, OpenAI (incl. sk-proj-), DeepSeek and the rest of the sk- family
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{7,}/g,
  // Google AI Studio
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  // Groq
  /\bgsk_[A-Za-z0-9]{8,}/g,
  // xAI
  /\bxai-[A-Za-z0-9]{8,}/g,
  // key=value / "key": "value" for credential-ish names (covers AssemblyAI, Mistral raw keys)
  /(["']?(?:api[_-]?key|x-api-key|x-goog-api-key|authorization|token|secret)["']?\s*[:=]\s*)(["']?)[^\s"',;&}]{8,}\2/gi,
  // ?key=AIza... style query params
  /([?&](?:key|api_key|apikey|token)=)[^&\s"']+/gi,
]

export function redact(s: string): string {
  if (typeof s !== 'string' || s.length === 0) return ''
  let out = s
  for (const re of PATTERNS) {
    out = out.replace(re, (match, prefix?: unknown, quote?: unknown) => {
      // key=value patterns capture the leading name so we keep it readable.
      if (typeof prefix === 'string' && prefix.length > 0 && match.startsWith(prefix)) {
        const q = typeof quote === 'string' ? quote : ''
        return `${prefix}${q}${MASK}${q}`
      }
      return MASK
    })
  }
  return out
}
