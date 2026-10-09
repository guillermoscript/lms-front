/**
 * Super-admin bank account form input (#929). Pure (zod only), safe in client
 * bundles; mirrors the `platform_bank_accounts` CHECKs so the form fails with
 * a field error, not a 23514.
 */
import { z } from 'zod'

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

/** Mirrors the table CHECKs so the form fails with a field error, not a 23514. */
export const bankAccountInputSchema = z.object({
  currency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
  label: z.string().trim().min(1).max(80),
  bankName: z.string().trim().min(1).max(120),
  accountHolder: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(1).max(64),
  accountType: optional(40),
  routingNumber: optional(40),
  swiftCode: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\s+/g, '').toUpperCase() : ''))
    .pipe(z.union([z.literal(''), z.string().regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/)]))
    .transform((v) => (v ? v : null)),
  extraInstructions: optional(1000),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
  isActive: z.boolean().default(true),
})

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
