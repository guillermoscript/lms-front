/**
 * Structural Supabase client surface — intentionally NOT `import { SupabaseClient }`.
 *
 * Web (lms-front) and mobile (lms-app) are separate repos, each with its own
 * `@supabase/supabase-js` install. `SupabaseClient` carries nominal/branded members,
 * so the two installs' types are not assignable to each other — passing the app's
 * client to a fn typed against lms-front's copy fails (TS2345). Typing the param
 * structurally (just the `.from`/`.rpc` we call) decouples core from either copy's
 * brand, so any supabase-js client satisfies it. Return types are declared explicitly
 * on each query fn, so call sites still get fully-typed `data`.
 */
export interface DbClient {
  from(table: string): any
  rpc(fn: string, args?: Record<string, unknown>): any
}

/** Shape of an awaited supabase query — `{ data, error }`. */
export type DbResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>
