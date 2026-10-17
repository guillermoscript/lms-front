/**
 * Estimated list prices (USD per 1M tokens) for the cost view in
 * /dashboard/admin/ai-usage. These are ESTIMATES for planning, not a bill: the
 * school's provider invoice is the source of truth. Prices change, so cost is
 * computed at read time from stored token counts and fixing a row here fixes
 * history. Unknown models return `null` and the UI shows tokens only.
 *
 * Matching: the model id is lowercased, an OpenRouter-style `vendor/` prefix
 * and a `:variant` suffix are dropped, then the LONGEST key that is a prefix
 * of the id wins (so `gpt-4o-mini-2024-07-18` hits `gpt-4o-mini`, not `gpt-4o`).
 *
 * Pure module: safe to import from client components.
 */
export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number
  /** USD per 1M output tokens (reasoning tokens are billed as output). */
  output: number
  /** USD per 1M cached input tokens; defaults to `input` when absent. */
  cachedInput?: number
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI
  'gpt-5-nano': { input: 0.05, output: 0.4, cachedInput: 0.005 },
  'gpt-5-mini': { input: 0.25, output: 2, cachedInput: 0.025 },
  'gpt-5': { input: 1.25, output: 10, cachedInput: 0.125 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cachedInput: 0.025 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
  'gpt-4.1': { input: 2, output: 8, cachedInput: 0.5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
  'gpt-4o': { input: 2.5, output: 10, cachedInput: 1.25 },
  'o4-mini': { input: 1.1, output: 4.4, cachedInput: 0.275 },
  // Anthropic
  'claude-haiku-4': { input: 1, output: 5, cachedInput: 0.1 },
  'claude-sonnet-4': { input: 3, output: 15, cachedInput: 0.3 },
  'claude-opus-4': { input: 5, output: 25, cachedInput: 0.5 },
  'claude-3-5-haiku': { input: 0.8, output: 4, cachedInput: 0.08 },
  // Google
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4, cachedInput: 0.025 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5, cachedInput: 0.075 },
  'gemini-2.5-pro': { input: 1.25, output: 10, cachedInput: 0.31 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4, cachedInput: 0.025 },
  // DeepSeek
  'deepseek-chat': { input: 0.28, output: 0.42, cachedInput: 0.028 },
  'deepseek-reasoner': { input: 0.28, output: 0.42, cachedInput: 0.028 },
  // Mistral
  'mistral-small': { input: 0.1, output: 0.3 },
  'mistral-medium': { input: 0.4, output: 2 },
  'mistral-large': { input: 2, output: 6 },
  // Groq (hosted open models)
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  // xAI
  'grok-4-fast': { input: 0.2, output: 0.5 },
  'grok-4': { input: 3, output: 15 },
  'grok-3-mini': { input: 0.3, output: 0.5 },
  'grok-3': { input: 3, output: 15 },
}

const KEYS_LONGEST_FIRST = Object.keys(MODEL_PRICES).sort((a, b) => b.length - a.length)

export function priceForModel(modelId: string): ModelPrice | null {
  let id = modelId.toLowerCase()
  const slash = id.lastIndexOf('/')
  if (slash >= 0) id = id.slice(slash + 1)
  const colon = id.indexOf(':')
  if (colon >= 0) id = id.slice(0, colon)
  const key = KEYS_LONGEST_FIRST.find((k) => id.startsWith(k))
  return key ? MODEL_PRICES[key] : null
}

export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
}

/**
 * Estimated USD for one token bucket, or `null` when the model has no known
 * price. `inputTokens` is the provider's TOTAL input (cached included), so the
 * cached part is billed at the cached rate and the rest at the full rate.
 */
export function estimateCostUsd(modelId: string, t: TokenCounts): number | null {
  const price = priceForModel(modelId)
  if (!price) return null
  const cached = Math.min(t.cachedInputTokens ?? 0, t.inputTokens)
  const fresh = t.inputTokens - cached
  return (
    (fresh * price.input + cached * (price.cachedInput ?? price.input) + t.outputTokens * price.output) / 1_000_000
  )
}
