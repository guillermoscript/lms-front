import 'server-only'

/**
 * Masks anything shaped like a provider API key / bearer token in a string,
 * for logs, Sentry events and error messages. Pure string transform; the
 * patterns live in redact-core.ts.
 */
export { redact } from './redact-core'
