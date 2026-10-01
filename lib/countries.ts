/**
 * A school's country (#865) — `tenants.country`, ISO 3166-1 alpha-2, nullable.
 *
 * Country decides the default currency today; payment rails, taxes and the
 * default locale follow in their own issues. There is deliberately NO default
 * country anywhere: "not chosen yet" is `null`, never a guess.
 *
 * Pure module (no server or browser APIs) so the create-school page, the
 * picker, the settings action and the unit tests all share one source.
 */

/** Every officially assigned ISO 3166-1 alpha-2 code. */
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
] as const

export type CountryCode = (typeof COUNTRY_CODES)[number]

const COUNTRY_SET: ReadonlySet<string> = new Set(COUNTRY_CODES)

/**
 * `'co'`, `' CO '` → `'CO'`; anything that is not an assigned ISO code
 * (including Cloudflare's `XX` / `T1` placeholders) → `null`.
 */
export function normalizeCountry(input: unknown): CountryCode | null {
  if (typeof input !== 'string') return null
  const code = input.trim().toUpperCase()
  return COUNTRY_SET.has(code) ? (code as CountryCode) : null
}

/**
 * Country → the currency a school there most likely sells in.
 *
 * Only countries we have a considered answer for are listed; a country that
 * is missing simply leaves the school's `currency` setting untouched. Where a
 * country's economy runs on the dollar the map says USD even if a local
 * currency also exists (EC, SV and PR are officially dollarised; PA's balboa
 * circulates only as coins; VE prices in dollars because the bolívar reprices
 * weekly).
 */
export const COUNTRY_CURRENCY: Readonly<Partial<Record<CountryCode, string>>> = {
  // Latin America & the Caribbean
  AR: 'ARS', BO: 'BOB', BR: 'BRL', CL: 'CLP', CO: 'COP', CR: 'CRC', DO: 'DOP',
  EC: 'USD', GT: 'GTQ', HN: 'HNL', MX: 'MXN', NI: 'NIO', PA: 'USD', PE: 'PEN',
  PR: 'USD', PY: 'PYG', SV: 'USD', UY: 'UYU', VE: 'USD',
  // North America
  US: 'USD', CA: 'CAD',
  // Other English-speaking markets
  GB: 'GBP', AU: 'AUD', NZ: 'NZD', IN: 'INR', ZA: 'ZAR', SG: 'SGD', PH: 'PHP',
  // Euro area
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR',
  FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR',
  LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
  // Rest of Europe
  CH: 'CHF', CZ: 'CZK', DK: 'DKK', HU: 'HUF', NO: 'NOK', PL: 'PLN', RO: 'RON', SE: 'SEK',
  // Asia
  JP: 'JPY',
}

/** The default currency for a country, or `null` when we have no answer. */
export function defaultCurrencyForCountry(country: string | null | undefined): string | null {
  const code = normalizeCountry(country)
  return code ? COUNTRY_CURRENCY[code] ?? null : null
}

/**
 * Every currency a school can pick as its default: whatever the country map
 * can produce, so a filled-in currency is always one the settings form can
 * show. Sorted by code.
 */
export const SCHOOL_CURRENCIES: readonly string[] = Array.from(
  new Set(Object.values(COUNTRY_CURRENCY) as string[])
).sort()

/**
 * Whether a `tenant_settings.currency` value counts as "not chosen": no row,
 * or a row whose `value` is blank. Only then may a country fill it in — an
 * admin's own choice is never overwritten.
 */
export function isCurrencySettingEmpty(settingValue: unknown): boolean {
  if (!settingValue || typeof settingValue !== 'object') return true
  const value = (settingValue as { value?: unknown }).value
  return typeof value !== 'string' || value.trim() === ''
}

/** A header source — `Headers`, or `ReadonlyHeaders` from `next/headers`. */
type HeaderReader = { get(name: string): string | null }

/** Edge geo headers, most specific first. */
const GEO_HEADERS = ['x-vercel-ip-country', 'cf-ipcountry'] as const

/**
 * Best guess at the visitor's country, for PRE-SELECTING the picker only.
 *
 * 1. an edge geo header (`x-vercel-ip-country`, `cf-ipcountry`)
 * 2. the first `Accept-Language` tag that carries a region (`es-CO` → CO;
 *    `es-419` and bare `es` carry no country and are skipped)
 *
 * Returns `null` when nothing is known — the caller must then show an empty
 * picker, never a hardcoded default.
 */
export function detectCountry(headers: HeaderReader): CountryCode | null {
  for (const name of GEO_HEADERS) {
    const code = normalizeCountry(headers.get(name))
    if (code) return code
  }
  return countryFromAcceptLanguage(headers.get('accept-language'))
}

/** First region-bearing tag in an `Accept-Language` header, by q-weight. */
export function countryFromAcceptLanguage(header: string | null | undefined): CountryCode | null {
  if (!header) return null
  const tags = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      const weight = q ? Number(q.slice(2)) : 1
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter(t => t.tag && t.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)

  for (const { tag } of tags) {
    // language[-script][-REGION]…  — the region is the 2-letter subtag after
    // the language (and optional 4-letter script).
    const subtags = tag.split(/[-_]/).slice(1)
    for (const sub of subtags) {
      if (sub.length === 4) continue // script, e.g. zh-Hant-TW
      const code = sub.length === 2 ? normalizeCountry(sub) : null
      if (code) return code
      break // a numeric region (419) or variant: no country in this tag
    }
  }
  return null
}

/** `{ code, name }` for every country, names in `locale`, sorted by name. */
export function countryOptions(locale: string): { code: CountryCode; name: string }[] {
  const names = regionNames(locale)
  const collator = new Intl.Collator(locale)
  return COUNTRY_CODES.map(code => ({ code, name: names?.of(code) ?? code })).sort((a, b) =>
    collator.compare(a.name, b.name)
  )
}

/** A country's display name in `locale`, falling back to its code. */
export function countryName(code: string, locale: string): string {
  return regionNames(locale)?.of(code) ?? code
}

function regionNames(locale: string): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    return null
  }
}
