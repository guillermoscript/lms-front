/**
 * Super-admin payment account form input (#929). Pure (zod only), safe in
 * client bundles; mirrors the `platform_bank_accounts` CHECKs so the form fails
 * with a field error, not a 23514.
 *
 * An account is a bank transfer (`bank`) or one of the same catalog methods
 * schools configure (`lib/payments/manual-payment-accounts.ts`). Columns are
 * shared across methods: the Binance Pay ID and the Pago Móvil phone live in
 * `accountNumber`, the Pago Móvil cédula/RIF in `document`.
 */
import { z } from 'zod'
import { MANUAL_PAYMENT_KINDS } from '@/lib/payments/manual-payment-accounts'

export const PLATFORM_ACCOUNT_KINDS = ['bank', ...MANUAL_PAYMENT_KINDS] as const
export type PlatformAccountKind = (typeof PLATFORM_ACCOUNT_KINDS)[number]

export function isPlatformAccountKind(value: unknown): value is PlatformAccountKind {
  return typeof value === 'string' && (PLATFORM_ACCOUNT_KINDS as readonly string[]).includes(value)
}

export type PlatformAccountFieldKey =
  | 'bankName'
  | 'accountHolder'
  | 'accountNumber'
  | 'accountType'
  | 'routingNumber'
  | 'swiftCode'
  | 'email'
  | 'document'
  | 'extraInstructions'

export interface PlatformAccountFieldSpec {
  key: PlatformAccountFieldKey
  required: boolean
}

/**
 * Which fields each method asks for, in display order. The single source for
 * the admin form, the required-field check, the table and the school dialog;
 * mirrors the `platform_bank_accounts_kind_required` CHECK.
 */
export const PLATFORM_KIND_FIELDS: Record<PlatformAccountKind, PlatformAccountFieldSpec[]> = {
  bank: [
    { key: 'bankName', required: true },
    { key: 'accountHolder', required: true },
    { key: 'accountNumber', required: true },
    { key: 'accountType', required: false },
    { key: 'routingNumber', required: false },
    { key: 'swiftCode', required: false },
    { key: 'extraInstructions', required: false },
  ],
  zelle: [
    { key: 'email', required: true },
    { key: 'accountHolder', required: false },
    { key: 'extraInstructions', required: false },
  ],
  binance: [
    { key: 'accountNumber', required: true },
    { key: 'email', required: false },
    { key: 'extraInstructions', required: false },
  ],
  paypal: [
    { key: 'email', required: true },
    { key: 'extraInstructions', required: false },
  ],
  zinli: [
    { key: 'email', required: true },
    { key: 'accountHolder', required: false },
    { key: 'extraInstructions', required: false },
  ],
  cash: [{ key: 'extraInstructions', required: true }],
  pago_movil: [
    { key: 'bankName', required: true },
    { key: 'accountNumber', required: true },
    { key: 'document', required: true },
    { key: 'accountHolder', required: false },
    { key: 'extraInstructions', required: false },
  ],
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

/** Mirrors the table CHECKs so the form fails with a field error, not a 23514. */
export const bankAccountInputSchema = z
  .object({
    kind: z.enum(PLATFORM_ACCOUNT_KINDS).default('bank'),
    currency: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/)),
    label: z.string().trim().min(1).max(80),
    bankName: optional(120),
    accountHolder: optional(120),
    accountNumber: optional(64),
    accountType: optional(40),
    routingNumber: optional(40),
    swiftCode: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v.replace(/\s+/g, '').toUpperCase() : ''))
      .pipe(z.union([z.literal(''), z.string().regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/)]))
      .transform((v) => (v ? v : null)),
    email: optional(254),
    document: optional(40),
    extraInstructions: optional(1000),
    sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    for (const spec of PLATFORM_KIND_FIELDS[v.kind]) {
      if (spec.required && !v[spec.key]) ctx.addIssue({ code: 'custom', path: [spec.key], message: 'required' })
    }
    if (v.email && !EMAIL_RE.test(v.email)) ctx.addIssue({ code: 'custom', path: ['email'], message: 'email' })
  })
  // Fields the chosen method does not ask for are dropped, so switching a row's
  // method never leaves a stale bank number behind.
  .transform((v) => {
    const allowed = new Set<string>(PLATFORM_KIND_FIELDS[v.kind].map((s) => s.key))
    const out = { ...v }
    for (const key of Object.keys(out) as PlatformAccountFieldKey[]) {
      if (isDataField(key) && !allowed.has(key)) out[key] = null
    }
    return out
  })

const DATA_FIELDS: readonly PlatformAccountFieldKey[] = [
  'bankName',
  'accountHolder',
  'accountNumber',
  'accountType',
  'routingNumber',
  'swiftCode',
  'email',
  'document',
  'extraInstructions',
]
function isDataField(key: string): key is PlatformAccountFieldKey {
  return (DATA_FIELDS as readonly string[]).includes(key)
}

export type BankAccountInput = z.output<typeof bankAccountInputSchema>
export type BankAccountField = keyof BankAccountInput

/** Parse form input; on failure returns the offending field names (never the values). */
export function parseBankAccountInput(
  raw: unknown,
): { ok: true; value: BankAccountInput } | { ok: false; fields: BankAccountField[] } {
  const parsed = bankAccountInputSchema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data }
  const fields = Array.from(new Set(parsed.error.issues.map((i) => String(i.path[0]) as BankAccountField)))
  return { ok: false, fields }
}
