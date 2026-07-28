/**
 * How widgets render a student whose profile has no display name.
 *
 * `profiles.full_name` is nullable and `fetchProfileNames()` deliberately drops
 * blanks, so `student_name: null` is a normal value on every roster — not an
 * error case. Each widget used to invent its own fallback out of the user id
 * (`student_id.slice(0, 8)`, initials from the same slice), which put strings
 * like `u-008` and `U-` in the name column: a teacher reads that as corrupted
 * data, and it identifies nobody. The id is not a name and must never stand in
 * for one.
 *
 * Resolving the real person would mean their email, which lives in
 * `auth.users` and is reachable only through `auth.admin.getUserById()` — a
 * service-role call these tools cannot make on the caller's RLS-scoped client.
 * So the honest answer is a generic placeholder, rendered visibly as a
 * placeholder (see `isNamedStudent`) rather than passed off as a name.
 */

/** English placeholder; callers with a `STRINGS` table pass their own. */
export const UNNAMED_STUDENT = "Unnamed student";

/** Whether the roster actually knows this student's name. */
export function isNamedStudent(name: string | null | undefined): boolean {
  return !!name && name.trim().length > 0;
}

/**
 * The name to render — never a user id.
 *
 * The placeholder is a widget-owned string, so it is translated like the rest
 * of them (`resources/shared/i18n.tsx`) and passed in; a real `full_name` is
 * database content and is always rendered verbatim.
 */
export function studentDisplayName(
  name: string | null | undefined,
  unnamedLabel: string = UNNAMED_STUDENT
): string {
  return isNamedStudent(name) ? name!.trim() : unnamedLabel;
}

/**
 * Avatar initials. Degrades to a neutral glyph rather than letters derived from
 * an id, which would read as someone's initials without being anyone's.
 */
export function studentInitials(name: string | null | undefined): string {
  if (!isNamedStudent(name)) return "·";
  const parts = name!.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")) || "·";
}
