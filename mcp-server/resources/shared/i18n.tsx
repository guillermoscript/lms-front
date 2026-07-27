import { useMemo } from "react";
import { useWidget } from "mcp-use/react";

/**
 * Widget-side i18n — the strings a widget owns, and every number/date it prints.
 *
 * WHY THIS EXISTS
 *   Course content comes out of the database in the school's own language, but
 *   every string the *widget* owns was hardcoded English ("True"/"False",
 *   "Back"/"Next", "Save grade", "last active"), and dates were formatted with
 *   an implicit `en-US`. A Spanish course rendered a Spanish lesson title above
 *   an English button and a `Jul 24, 2026` date. en/es is a product
 *   requirement, so the widget half has to follow the content.
 *
 * WHERE THE LOCALE COMES FROM
 *   `useWidget().locale` — a BCP 47 tag the host supplies (SEP-1865
 *   `HostContext.locale` / `window.openai.locale`). There is no locale column
 *   anywhere in the LMS schema, so the host is the only source of truth; the
 *   `_meta` override below exists for previewing, not as a second opinion.
 *
 * WHAT IS DELIBERATELY *NOT* TRANSLATED
 *   Anything that came out of the database — course titles, lesson titles,
 *   descriptions, tag names, student names. Those are already in the school's
 *   language and must be rendered verbatim.
 */

/**
 * `_meta` key a tool may set to force a widget's language.
 *
 * The only production reason to set this would be a school whose content
 * language differs from the reader's chat client; nothing sets it today. It
 * exists so the offline fixture preview can render Spanish at all: the headless
 * screenshot harness (`scripts/shoot-demo-widgets.sh`) renders through the
 * mcp-use dev inspector, which supplies no host locale, so every widget would
 * otherwise be pinned to the `"en"` default and the Spanish path would have no
 * committed evidence. Keep in sync with `LOCALE_META_KEY` in `src/locale.ts`.
 */
export const LOCALE_META_KEY = "lms/locale";

/** The languages the LMS ships. Mirrors the app's own `en`/`es` routing. */
export type Lang = "en" | "es";

const FALLBACK: Lang = "en";

/**
 * Reduce a BCP 47 tag to a language we have strings for.
 *
 * `es-419` (Latin American Spanish) and `es-ES` both collapse to `es` — the
 * user base spans LATAM and Spain and the widget strings are neutral between
 * them. Anything we do not ship falls back to English rather than rendering a
 * key.
 */
export function normalizeLang(tag: string | null | undefined): Lang {
  const base = String(tag ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return base === "es" ? "es" : FALLBACK;
}

/** Read the raw host context this widget was rendered with. */
function useLocaleContext(): { lang: Lang; intlLocale: string; timeZone?: string } {
  const { locale, timeZone, metadata } = useWidget<Record<string, unknown>>();
  const meta = metadata as Record<string, unknown> | null | undefined;
  const override = meta?.[LOCALE_META_KEY];
  const tag = typeof override === "string" && override ? override : locale;
  const lang = normalizeLang(tag);

  return useMemo(() => {
    // Keep the region when it agrees with the language we resolved: `es-419`
    // and `en-GB` format dates and numbers better than a bare `es`/`en`. When
    // they disagree (host says `fr-FR`, we fell back to English) the region
    // would format in the wrong convention, so drop it.
    const full = String(tag ?? "");
    const intlLocale = normalizeLang(full) === lang && full ? full : lang;
    return { lang, intlLocale, timeZone: timeZone || undefined };
  }, [tag, lang, timeZone]);
}

/** The language this widget should render its own strings in. */
export function useLang(): Lang {
  return useLocaleContext().lang;
}

/**
 * Pick this widget's string table.
 *
 * Each widget declares its own table next to the component — the strings are
 * few, they are specific to that widget, and keeping them local means a widget
 * can be read in one file. Both branches are the same shape, so a missing
 * Spanish string is a type error rather than a fallback at runtime.
 *
 * @example
 *   const S = { en: { next: "Next" }, es: { next: "Siguiente" } };
 *   const t = useStrings(S);
 *   <button>{t.next}</button>
 */
export function useStrings<T>(table: Record<Lang, T>): T {
  return table[useLang()];
}

export interface Formatters {
  /** The resolved BCP 47 tag actually handed to `Intl`. */
  locale: string;
  /** `24 jul 2026` / `Jul 24, 2026` — a calendar date with no time. */
  date: (value: string | number | Date | null | undefined) => string;
  /** Same, spelled out: `24 de julio de 2026` / `July 24, 2026`. */
  dateLong: (value: string | number | Date | null | undefined) => string;
  /** Date plus wall-clock time in the host's timezone. */
  dateTime: (value: string | number | Date | null | undefined) => string;
  /** Grouped integer/decimal: `1.234,5` / `1,234.5`. */
  number: (value: number | null | undefined, opts?: Intl.NumberFormatOptions) => string;
  /** A 0–100 progress value as a percent: `64 %` / `64%`. */
  percent: (value: number | null | undefined) => string;
  /** Money in its own currency: `$29.00` / `29,00 US$`. */
  currency: (value: number | null | undefined, currency?: string | null) => string;
  /** `in 5 days` / `dentro de 5 días`, `yesterday` / `ayer`. */
  relativeDays: (days: number) => string;
  /** Whole days from now until `value`; negative when past. `null` if unparseable. */
  daysUntil: (value: string | number | Date | null | undefined) => number | null;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `Intl` formatters bound to the host's locale and timezone.
 *
 * Memoised per locale: constructing an `Intl.DateTimeFormat` is the expensive
 * part, and widgets format one per row.
 *
 * Every formatter renders an em dash for null/unparseable input rather than
 * `Invalid Date` or `NaN%` — a missing value is a normal state in these
 * payloads (an unscheduled exam, an ungraded submission).
 */
export function useFormat(): Formatters {
  const { intlLocale, timeZone } = useLocaleContext();

  return useMemo(() => {
    const EMPTY = "—";
    const dateFmt = new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    });
    const dateLongFmt = new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    });
    const dateTimeFmt = new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    const relFmt = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });

    const fmtDate =
      (f: Intl.DateTimeFormat) => (value: string | number | Date | null | undefined) => {
        const d = toDate(value);
        return d ? f.format(d) : EMPTY;
      };

    const daysUntil = (value: string | number | Date | null | undefined): number | null => {
      const d = toDate(value);
      if (!d) return null;
      // Compare calendar days, not elapsed milliseconds: an exam at 09:00
      // tomorrow is "in 1 day", not "in 0 days" because it is 15 hours away.
      const startOfDay = (x: Date) =>
        Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
      const MS_PER_DAY = 86_400_000;
      return Math.round((startOfDay(d) - startOfDay(new Date())) / MS_PER_DAY);
    };

    return {
      locale: intlLocale,
      date: fmtDate(dateFmt),
      dateLong: fmtDate(dateLongFmt),
      dateTime: fmtDate(dateTimeFmt),
      number: (value, opts) =>
        typeof value === "number" && Number.isFinite(value)
          ? new Intl.NumberFormat(intlLocale, opts).format(value)
          : EMPTY,
      percent: (value) =>
        typeof value === "number" && Number.isFinite(value)
          ? // The payloads carry 0–100, not 0–1, so this is a formatted number
            // with a unit rather than `style: "percent"` (which would multiply).
            new Intl.NumberFormat(intlLocale, {
              style: "unit",
              unit: "percent",
              maximumFractionDigits: 0,
            }).format(value)
          : EMPTY,
      currency: (value, currency) =>
        typeof value === "number" && Number.isFinite(value)
          ? new Intl.NumberFormat(intlLocale, {
              style: "currency",
              currency: (currency || "USD").toUpperCase(),
            }).format(value)
          : EMPTY,
      relativeDays: (days) => relFmt.format(days, "day"),
      daysUntil,
    };
  }, [intlLocale, timeZone]);
}
