/**
 * What this product is called, in one place (#738).
 *
 * The name is still undecided — the marketing copy shipped the placeholder
 * "LMS V2" to production, and five call sites each carried their own fallback
 * ("LMS", "LMS Platform", "LMS Academy"), so renaming meant a copy sweep rather
 * than a config change. Every user-visible mention now resolves through here,
 * and the sentences that mention it take it as an ICU `{appName}` value instead
 * of baking it into the catalogs.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so this is a build-time constant on
 * both the server and in the browser bundle. It is a *build* arg in CI, not a
 * Dokploy service variable — see CLAUDE.md, "Build-time env vars".
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'LMS Platform'
