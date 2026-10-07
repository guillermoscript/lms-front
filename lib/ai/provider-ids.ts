/**
 * Static provider metadata with NO SDK imports, so UI code (settings form,
 * feature pickers) can use it without pulling `@ai-sdk/*` into a bundle.
 * `lib/ai/providers.ts` re-exports everything here and adds the factories.
 */

export const PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'groq',
  'mistral',
  'xai',
  'deepseek',
  'assemblyai',
] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

export type ProviderKind = 'language' | 'stt' | 'realtime' | 'image'

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  mistral: 'Mistral',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  assemblyai: 'AssemblyAI',
}

/** What each provider can serve. AssemblyAI is speech-to-text only. */
export const PROVIDER_KINDS: Record<ProviderId, readonly ProviderKind[]> = {
  openai: ['language', 'stt', 'realtime', 'image'],
  anthropic: ['language'],
  google: ['language', 'realtime', 'image'],
  openrouter: ['language'],
  groq: ['language', 'stt'],
  mistral: ['language'],
  xai: ['language', 'realtime', 'image'],
  deepseek: ['language'],
  assemblyai: ['stt'],
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)
}
