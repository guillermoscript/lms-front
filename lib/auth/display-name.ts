/**
 * A display name for someone who did not type one (#790).
 *
 * Signup used to refuse to proceed without a full name, because
 * `handle_new_user()` copies it into `profiles` and an empty one shows up as
 * "Unknown Student" on every teacher and admin list. That is a reason to have
 * *a* name, not a reason to make the visitor supply it before an account
 * exists — so an empty field falls back to the email's local part, and the
 * student can correct it in their profile.
 *
 * `ada.lovelace@x.com` → `Ada Lovelace` · `ada_lovelace99@x.com` → `Ada Lovelace`
 * An address with nothing word-like in it (`42@x.com`) keeps the local part as
 * typed rather than inventing something.
 */
export function deriveNameFromEmail(email: string): string {
  const local = email.trim().split('@')[0] ?? ''
  if (!local) return ''

  const words = local
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))

  return words.length > 0 ? words.join(' ') : local
}
