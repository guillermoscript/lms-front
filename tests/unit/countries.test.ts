import { describe, expect, it } from 'vitest'
import {
  COUNTRY_CODES,
  COUNTRY_CURRENCY,
  SCHOOL_CURRENCIES,
  countryFromAcceptLanguage,
  countryName,
  countryOptions,
  defaultCurrencyForCountry,
  detectCountry,
  isCurrencySettingEmpty,
  normalizeCountry,
} from '@/lib/countries'

const headersOf = (entries: Record<string, string>) => new Headers(entries)

describe('COUNTRY_CODES', () => {
  it('lists every assigned ISO 3166-1 alpha-2 code once', () => {
    expect(COUNTRY_CODES).toHaveLength(249)
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
    for (const code of COUNTRY_CODES) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('every country in the currency map is a real code and maps to an ISO 4217 shape', () => {
    for (const [country, currency] of Object.entries(COUNTRY_CURRENCY)) {
      expect(normalizeCountry(country)).toBe(country)
      expect(currency).toMatch(/^[A-Z]{3}$/)
    }
  })
})

describe('normalizeCountry', () => {
  it('upper-cases and trims', () => {
    expect(normalizeCountry(' co ')).toBe('CO')
  })

  it('rejects unassigned codes, placeholders and non-strings', () => {
    expect(normalizeCountry('XX')).toBeNull() // Cloudflare "unknown"
    expect(normalizeCountry('T1')).toBeNull() // Cloudflare Tor
    expect(normalizeCountry('COL')).toBeNull()
    expect(normalizeCountry('')).toBeNull()
    expect(normalizeCountry(null)).toBeNull()
    expect(normalizeCountry(42)).toBeNull()
  })
})

describe('defaultCurrencyForCountry', () => {
  it('maps LATAM countries to their selling currency', () => {
    expect(defaultCurrencyForCountry('CO')).toBe('COP')
    expect(defaultCurrencyForCountry('MX')).toBe('MXN')
    expect(defaultCurrencyForCountry('AR')).toBe('ARS')
    expect(defaultCurrencyForCountry('BR')).toBe('BRL')
  })

  it('maps dollarised economies to USD', () => {
    for (const code of ['EC', 'SV', 'PA', 'PR', 'VE']) {
      expect(defaultCurrencyForCountry(code)).toBe('USD')
    }
  })

  it('maps English-speaking and euro markets', () => {
    expect(defaultCurrencyForCountry('US')).toBe('USD')
    expect(defaultCurrencyForCountry('GB')).toBe('GBP')
    expect(defaultCurrencyForCountry('ES')).toBe('EUR')
  })

  it('returns null for an unmapped, invalid or missing country — never a default', () => {
    expect(defaultCurrencyForCountry('MA')).toBeNull()
    expect(defaultCurrencyForCountry('ZZ')).toBeNull()
    expect(defaultCurrencyForCountry(null)).toBeNull()
    expect(defaultCurrencyForCountry(undefined)).toBeNull()
  })
})

describe('SCHOOL_CURRENCIES', () => {
  it('holds every currency the map can produce, sorted and unique', () => {
    for (const currency of Object.values(COUNTRY_CURRENCY)) {
      expect(SCHOOL_CURRENCIES).toContain(currency)
    }
    expect([...SCHOOL_CURRENCIES].sort()).toEqual(SCHOOL_CURRENCIES)
    expect(new Set(SCHOOL_CURRENCIES).size).toBe(SCHOOL_CURRENCIES.length)
  })

  it('keeps the currencies the settings form offered before #865', () => {
    for (const legacy of ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'MXN']) {
      expect(SCHOOL_CURRENCIES).toContain(legacy)
    }
  })
})

describe('isCurrencySettingEmpty', () => {
  it('treats a missing row or a blank value as empty', () => {
    expect(isCurrencySettingEmpty(null)).toBe(true)
    expect(isCurrencySettingEmpty(undefined)).toBe(true)
    expect(isCurrencySettingEmpty({})).toBe(true)
    expect(isCurrencySettingEmpty({ value: '' })).toBe(true)
    expect(isCurrencySettingEmpty({ value: '  ' })).toBe(true)
    expect(isCurrencySettingEmpty({ value: null })).toBe(true)
  })

  it('never treats a chosen currency as empty', () => {
    expect(isCurrencySettingEmpty({ value: 'USD' })).toBe(false)
    expect(isCurrencySettingEmpty({ value: 'EUR' })).toBe(false)
  })
})

describe('detectCountry', () => {
  it('prefers the Vercel geo header, then Cloudflare', () => {
    expect(
      detectCountry(headersOf({ 'x-vercel-ip-country': 'CO', 'cf-ipcountry': 'MX', 'accept-language': 'en-US' }))
    ).toBe('CO')
    expect(detectCountry(headersOf({ 'cf-ipcountry': 'mx', 'accept-language': 'en-US' }))).toBe('MX')
  })

  it("skips Cloudflare's unknown / Tor placeholders and falls back to Accept-Language", () => {
    expect(detectCountry(headersOf({ 'cf-ipcountry': 'XX', 'accept-language': 'es-AR,es;q=0.9' }))).toBe('AR')
    expect(detectCountry(headersOf({ 'cf-ipcountry': 'T1' }))).toBeNull()
  })

  it('returns null when nothing names a country', () => {
    expect(detectCountry(headersOf({}))).toBeNull()
    expect(detectCountry(headersOf({ 'accept-language': 'es,en;q=0.8' }))).toBeNull()
  })
})

describe('countryFromAcceptLanguage', () => {
  it('reads the region subtag of the first tag that has one', () => {
    expect(countryFromAcceptLanguage('es-CO,es;q=0.9,en;q=0.8')).toBe('CO')
    expect(countryFromAcceptLanguage('es,en-GB;q=0.8')).toBe('GB')
  })

  it('orders by q-weight, not position', () => {
    expect(countryFromAcceptLanguage('en-US;q=0.5,es-MX;q=0.9')).toBe('MX')
  })

  it('skips scripts, numeric regions and zero-weight tags', () => {
    expect(countryFromAcceptLanguage('zh-Hant-TW')).toBe('TW')
    expect(countryFromAcceptLanguage('es-419,en-CA;q=0.5')).toBe('CA')
    expect(countryFromAcceptLanguage('en-US;q=0,fr')).toBeNull()
  })

  it('handles empty input', () => {
    expect(countryFromAcceptLanguage('')).toBeNull()
    expect(countryFromAcceptLanguage(null)).toBeNull()
    expect(countryFromAcceptLanguage('*')).toBeNull()
  })
})

describe('countryOptions / countryName', () => {
  it('names countries in the requested locale', () => {
    expect(countryName('ES', 'es')).toBe('España')
    expect(countryName('ES', 'en')).toBe('Spain')
  })

  it('returns every country once, sorted by localized name', () => {
    const options = countryOptions('es')
    expect(options).toHaveLength(COUNTRY_CODES.length)
    const names = options.map(o => o.name)
    const collator = new Intl.Collator('es')
    expect([...names].sort(collator.compare)).toEqual(names)
  })
})
