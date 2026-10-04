/**
 * What a milestone post says (#871).
 *
 * Milestone posts are written by the database (`community_create_milestone`)
 * with `content = ''`: every client renders the sentence from `milestone_type`
 * + `milestone_data`, so the web, the native app and notifications can each
 * localise it. The `milestone_data` contract:
 *
 *   course_completion  { course_id, course_title, certificate?: true }
 *                      `certificate` is set when the certificate was earned in
 *                      the same step — one post says both
 *   certificate        { course_id, course_title }
 *   level_up           { level }   an integer >= 5
 *   streak             { days }    7, 30 or 100
 *
 * `course_title` is a snapshot taken when the post was written, so a later
 * rename does not rewrite history. Anything malformed reads as a variant with
 * a missing value (the card falls back to a generic sentence) or `unknown`,
 * never as `undefined` on screen.
 */
export type Milestone =
  | { kind: 'course_completion'; course: string | null; certificate: boolean }
  | { kind: 'certificate'; course: string | null }
  | { kind: 'level_up'; level: number | null }
  | { kind: 'streak'; days: number | null }
  | { kind: 'unknown' }

function record(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function readMilestone(type: string | null | undefined, data: unknown): Milestone {
  const fields = record(data)
  switch (type) {
    case 'course_completion':
      return { kind: 'course_completion', course: text(fields.course_title), certificate: fields.certificate === true }
    case 'certificate':
      return { kind: 'certificate', course: text(fields.course_title) }
    case 'level_up':
      return { kind: 'level_up', level: positiveInteger(fields.level) }
    case 'streak':
      return { kind: 'streak', days: positiveInteger(fields.days) }
    default:
      return { kind: 'unknown' }
  }
}
