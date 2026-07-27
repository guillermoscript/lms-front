/**
 * Server-side half of widget language selection.
 *
 * Widgets normally take their language from the host: `useWidget().locale` is a
 * BCP 47 tag the MCP client supplies (SEP-1865 `HostContext.locale`). There is
 * no locale column anywhere in the LMS schema, so the host is the source of
 * truth and nothing in production overrides it.
 *
 * This key exists so a tool *can* pin a widget's language when it has a better
 * answer than the host. Today the only caller is the dev-only demo tool, which
 * needs it because the headless preview harness supplies no host locale at all:
 * without an override every fixture renders English and the Spanish half of the
 * widget strings has no way to be seen or reviewed.
 *
 * Keep in sync with `LOCALE_META_KEY` in `resources/shared/i18n.tsx`.
 */
export const LOCALE_META_KEY = "lms/locale";

/** Languages the widgets ship strings for. Mirrors the app's `en`/`es` routing. */
export const SUPPORTED_LANGS = ["en", "es"] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];
