import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import {
  MANUAL_KIND_FIELDS,
  MANUAL_PAYMENT_KINDS,
  blankPresetAccount,
  isManualPaymentAccountComplete,
  manualPaymentAccountLabel,
  normalizeManualPaymentAccounts,
  validateManualPaymentAccount,
} from '@/lib/payments/manual-payment-accounts'

describe('normalizeManualPaymentAccounts', () => {
  it('keeps a legacy row (no kind) as a custom row, label unchanged', () => {
    const [a] = normalizeManualPaymentAccounts({
      accounts: [
        { id: 'a1', method: 'Pago Móvil', bank: 'Banesco', identifier: '0412', holder: 'Ana', document: 'V-1', note: 'x' },
      ],
    })
    expect(a).toMatchObject({ id: 'a1', kind: null, email: null, method: 'Pago Móvil' })
    expect(manualPaymentAccountLabel(a)).toBe('Pago Móvil · Banesco · 0412')
  })

  it('accepts a bare array and drops junk and nameless custom rows', () => {
    const out = normalizeManualPaymentAccounts([null, 'x', { bank: 'no method' }, { method: ' Zelle ' }])
    expect(out).toHaveLength(1)
    expect(out[0].method).toBe('Zelle')
    expect(normalizeManualPaymentAccounts(undefined)).toEqual([])
    expect(normalizeManualPaymentAccounts({ accounts: 'nope' })).toEqual([])
  })

  it('keeps a known kind and drops an unknown one', () => {
    const out = normalizeManualPaymentAccounts([
      { kind: 'binance', method: 'Binance', email: 'a@b.co', identifier: '123' },
      { kind: 'bitcoin', method: 'Other' },
    ])
    expect(out[0].kind).toBe('binance')
    expect(out[1].kind).toBeNull()
  })

  it('names a preset row that has no method, and gives it a stable id', () => {
    const [a] = normalizeManualPaymentAccounts([{ kind: 'zelle', email: 'a@b.co' }])
    expect(a.method).toBe('Zelle')
    expect(a.id).toBe('preset-zelle')
  })

  it('demotes a duplicate preset to a custom row instead of dropping it', () => {
    const out = normalizeManualPaymentAccounts([
      { kind: 'zelle', method: 'Zelle', email: 'a@b.co' },
      { kind: 'zelle', method: 'Zelle 2', email: 'c@d.co' },
    ])
    expect(out.map((a) => a.kind)).toEqual(['zelle', null])
  })

  it('keeps ids unique when kinds are demoted or ids repeat', () => {
    const out = normalizeManualPaymentAccounts([
      { id: 'preset-zelle', kind: 'zelle', method: 'Zelle', email: 'a@b.co' },
      { id: 'preset-zelle', kind: 'zelle', method: 'Zelle 2', email: 'c@d.co' },
      { id: 'preset-zelle', method: 'Custom' },
      { id: 'x', method: 'A' },
      { id: 'x', method: 'B' },
      { method: 'C' },
    ])
    const ids = out.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(out[0].id).toBe('preset-zelle')
    expect(out[1].id).not.toBe('preset-zelle')
    expect(out[2].id).not.toBe('preset-zelle')
    expect(normalizeManualPaymentAccounts({ accounts: out }).map((a) => a.id)).toEqual(ids)
  })

  it('is idempotent, so normalising on read and on write cannot lose a field', () => {
    const once = normalizeManualPaymentAccounts([
      { kind: 'binance', method: 'Binance', email: 'a@b.co', identifier: '123', note: 'line1\n\n\n\nline2' },
    ])
    expect(normalizeManualPaymentAccounts({ accounts: once })).toEqual(once)
    expect(once[0].note).toBe('line1\n\nline2')
  })

  it('caps accounts at 12, fields at 120 and notes at 500', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ method: `M${i}` }))
    expect(normalizeManualPaymentAccounts(many)).toHaveLength(12)
    const [a] = normalizeManualPaymentAccounts([
      { method: 'x'.repeat(300), email: 'e'.repeat(300), note: 'n'.repeat(900) },
    ])
    expect(a.method).toHaveLength(120)
    expect(a.email).toHaveLength(120)
    expect(a.note).toHaveLength(500)
  })
})

describe('normalizeManualPaymentAccounts: secrets and garbage', () => {
  it('drops api_key, secret and credentials so they never reach the student-readable blob', () => {
    const [a] = normalizeManualPaymentAccounts([
      {
        kind: 'binance',
        method: 'Binance',
        identifier: '123',
        api_key: 'AKIA',
        api_secret: 's3cret',
        secret: 'x',
        credentials: { api_key: 'k', api_secret: 's' },
      },
    ])
    const json = JSON.stringify(a)
    expect(a).not.toHaveProperty('api_key')
    expect(a).not.toHaveProperty('secret')
    expect(a).not.toHaveProperty('credentials')
    expect(json).not.toContain('AKIA')
    expect(json).not.toContain('s3cret')
  })

  it('never throws on garbage input', () => {
    for (const v of [null, undefined, 1, 'x', true, {}, [], [[]], { accounts: {} }, [{ kind: {} , method: 5 }]]) {
      expect(() => normalizeManualPaymentAccounts(v)).not.toThrow()
    }
  })

  it('keeps note line breaks', () => {
    const [a] = normalizeManualPaymentAccounts([{ method: 'Cash', note: 'Mon-Fri\r\n9am' }])
    expect(a.note).toBe('Mon-Fri\n9am')
  })
})

describe('manualPaymentAccountLabel', () => {
  it('uses the email for a Zelle row that has one', () => {
    const a = { ...blankPresetAccount('zelle'), email: 'pay@school.com' }
    expect(manualPaymentAccountLabel(a)).toBe('Zelle · pay@school.com')
  })

  it('clamps to the 120 chars paid_to_account accepts', () => {
    const a = { ...blankPresetAccount('pago_movil'), bank: 'b'.repeat(120), identifier: 'i'.repeat(120) }
    expect(manualPaymentAccountLabel(a).length).toBe(120)
  })

  it('falls back to the email for rows addressed by email', () => {
    const a = { ...blankPresetAccount('paypal'), email: 'a@b.co' }
    expect(manualPaymentAccountLabel(a)).toBe('PayPal · a@b.co')
  })

  it('prefers the Binance Pay ID and never includes multi-line notes', () => {
    const a = { ...blankPresetAccount('binance'), email: 'a@b.co', identifier: '123', note: 'a\nb' }
    expect(manualPaymentAccountLabel(a)).toBe('Binance · 123')
  })
})

describe('isManualPaymentAccountComplete', () => {
  it('requires the fields each preset marks required', () => {
    const binance = blankPresetAccount('binance')
    expect(isManualPaymentAccountComplete(binance)).toBe(false)
    expect(isManualPaymentAccountComplete({ ...binance, email: 'a@b.co' })).toBe(false)
    expect(isManualPaymentAccountComplete({ ...binance, identifier: '1' })).toBe(true)
    expect(isManualPaymentAccountComplete({ ...blankPresetAccount('cash'), note: 'Office' })).toBe(true)
  })
})

describe('validateManualPaymentAccount', () => {
  const blank = blankPresetAccount
  it('requires what each kind marks required', () => {
    expect(validateManualPaymentAccount(blank('zelle')).errors).toEqual({ email: 'required' })
    expect(validateManualPaymentAccount(blank('binance')).errors).toEqual({
      identifier: 'required',
    })
    expect(validateManualPaymentAccount(blank('paypal')).errors).toEqual({ email: 'required' })
    expect(validateManualPaymentAccount(blank('zinli')).errors).toEqual({ email: 'required' })
    expect(validateManualPaymentAccount(blank('cash')).errors).toEqual({ note: 'required' })
    expect(validateManualPaymentAccount(blank('pago_movil')).errors).toEqual({
      bank: 'required',
      identifier: 'required',
      document: 'required',
    })
  })

  it('accepts a complete row of every kind', () => {
    const ok = [
      { ...blank('zelle'), email: 'a@b.co' },
      { ...blank('binance'), identifier: '1' },
      { ...blank('paypal'), email: 'a@b.co' },
      { ...blank('zinli'), email: 'a@b.co' },
      { ...blank('cash'), note: 'Office' },
      { ...blank('pago_movil'), bank: 'Banesco', identifier: '0412-123 4567', document: 'V-12345678' },
    ]
    for (const a of ok) expect(validateManualPaymentAccount(a)).toEqual({ ok: true, errors: {} })
  })

  it('rejects a malformed email', () => {
    expect(validateManualPaymentAccount({ ...blank('zelle'), email: 'nope' }).errors.email).toBe('email')
    expect(validateManualPaymentAccount({ ...blank('zelle'), email: 'a b@c.co' }).errors.email).toBe('email')
  })

  it('checks Pago Móvil phone (7-15 digits, +, spaces and dashes ignored) and document', () => {
    const base = { ...blank('pago_movil'), bank: 'B', document: 'V-12345678' }
    const phone = (identifier: string) =>
      validateManualPaymentAccount({ ...base, identifier }).errors.identifier
    expect(phone('+58 412-1234567')).toBeUndefined()
    expect(phone('1234567')).toBeUndefined()
    expect(phone('123456')).toBe('phone')
    expect(phone('1'.repeat(16))).toBe('phone')
    expect(phone('04a2123456')).toBe('phone')

    const doc = (document: string) =>
      validateManualPaymentAccount({ ...base, identifier: '04121234567', document }).errors.document
    for (const good of ['V-12345678', 'v12345678', '12345678', 'J-12345678-9', 'E-1234567']) {
      expect(doc(good), good).toBeUndefined()
    }
    for (const bad of ['abc', 'V-12', 'X-12345678', '123456789012']) {
      expect(doc(bad), bad).toBe('document')
    }
  })

  it('never blocks a custom (kind-less) row', () => {
    expect(validateManualPaymentAccount({ ...blank('cash'), kind: null }).ok).toBe(true)
  })
})

type KindMessages = {
  name?: string
  description?: string
  fields: Record<string, string>
  placeholders: Record<string, string>
}
type AccountsMessages = {
  dashboard: { admin: { settings: { form: { payment: { accounts: { kinds: Record<string, KindMessages> } } } } } }
}

describe('catalog i18n parity', () => {
  it.each([
    ['en', en],
    ['es', es],
  ])('%s has a name, description and every field label/placeholder', (_lang, messages) => {
    const acc = (messages as unknown as AccountsMessages).dashboard.admin.settings.form.payment.accounts
    for (const kind of MANUAL_PAYMENT_KINDS) {
      expect(acc.kinds[kind].name, `${kind}.name`).toBeTruthy()
      expect(acc.kinds[kind].description, `${kind}.description`).toBeTruthy()
      for (const spec of MANUAL_KIND_FIELDS[kind]) {
        expect(acc.kinds[kind].fields[spec.key], `${kind}.fields.${spec.key}`).toBeTruthy()
        expect(acc.kinds[kind].placeholders[spec.key], `${kind}.placeholders.${spec.key}`).toBeTruthy()
      }
    }
  })
})
