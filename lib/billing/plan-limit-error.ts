/**
 * Recognise the database-level plan-limit rejection (issue #658).
 *
 * `enforce_course_plan_limit` / `enforce_student_plan_limit` (migration
 * `20260901120000_plan_limit_db_triggers.sql`) raise SQLSTATE `LM001` with the
 * message `plan_limit_exceeded:<resource>` whenever a row would push a tenant
 * past `platform_plans.limits`. Every writer of `courses` / `tenant_users` —
 * server actions, the AI course generator, the product wizard RPC, the MCP
 * tools — can hit it, and each should turn it into the same upgrade copy the
 * app-layer pre-checks already show instead of leaking `plan_limit_exceeded`.
 *
 * Match on the SQLSTATE first; the message is only a fallback for callers that
 * re-wrap the PostgREST error into a plain `Error` (e.g. `throw courseError`).
 */

export const PLAN_LIMIT_SQLSTATE = 'LM001'

export type PlanLimitResource = 'courses' | 'students'

const MESSAGE_PATTERN = /plan_limit_exceeded:(courses|students)/

/**
 * Returns the resource the database refused (`courses` | `students`) when
 * `err` is the plan-limit trigger firing, `null` for anything else.
 */
export function parsePlanLimitError(err: unknown): PlanLimitResource | null {
  if (!err || typeof err !== 'object') return null
  const { code, message } = err as { code?: unknown; message?: unknown }

  if (code === PLAN_LIMIT_SQLSTATE || typeof message === 'string') {
    const match = typeof message === 'string' ? message.match(MESSAGE_PATTERN) : null
    if (match) return match[1] as PlanLimitResource
    // Code matched but the message was rewritten upstream — still a plan-limit
    // rejection; the resource is unknown so let the caller pick a default.
    if (code === PLAN_LIMIT_SQLSTATE) return null
  }
  return null
}

/** `true` when `err` is the plan-limit trigger, regardless of resource. */
export function isPlanLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { code, message } = err as { code?: unknown; message?: unknown }
  return code === PLAN_LIMIT_SQLSTATE || (typeof message === 'string' && MESSAGE_PATTERN.test(message))
}

export interface CourseLimitInfo {
  plan: string
  limit: number
  currentCount: number
}

/**
 * The course-limit copy `createCourse` has always thrown, so a rejection that
 * comes from the trigger reads exactly like one from the pre-check.
 */
export function courseLimitMessage(info: CourseLimitInfo): string {
  return (
    `Your ${info.plan} plan is limited to ${info.limit} courses. ` +
    `You currently have ${info.currentCount} courses. ` +
    `Please upgrade your plan to create more courses.`
  )
}

/** The student-seat copy `joinCurrentSchool` has always returned. */
export const STUDENT_LIMIT_MESSAGE =
  'This school has reached its student limit. Please contact the school administrator.'
