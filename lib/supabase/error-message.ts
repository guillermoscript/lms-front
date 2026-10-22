/**
 * Message for anything a `catch` can receive. Supabase's PostgrestError is
 * thrown as a plain object, not an `Error`, so `err instanceof Error` alone
 * hides the real cause (e.g. PGRST205 "Could not find the table … in the
 * schema cache") behind a generic fallback.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const { message, code } = err as { message?: unknown; code?: unknown }
    if (typeof message === 'string' && message) {
      return typeof code === 'string' && code ? `${message} (${code})` : message
    }
  }
  return fallback
}
