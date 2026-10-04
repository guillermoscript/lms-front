/**
 * The accounts a school will actually accept an offline payment into (#802).
 *
 * `manual_payment_instructions` — one free-text blob — was the only thing a
 * school could publish, which made every downstream job manual: the student
 * retyped whatever they could find in the prose, and the admin had no idea which
 * of their four accounts to open when a payment was claimed. These rows sit
 * beside that note (they do not replace it: "transfers before 6pm only" is still
 * prose) and give both sides something structured to point at.
 *
 * Stored on `tenant_settings.manual_payment_accounts` as `{ accounts: [...] }`.
 * Deliberately not a table: it is configuration a school edits as a unit, it is
 * read on every checkout, and it has no relations.
 */

export interface ManualPaymentAccount {
  /** Stable across edits so a student's `paid_to_account` keeps meaning something. */
  id: string
  /** "Pago Móvil", "Zelle", "Transferencia", "Binance" — the school's own words. */
  method: string
  bank: string | null
  /** Phone, email, account number or wallet address — whatever the method needs. */
  identifier: string | null
  /** Account holder, when it differs from the school's own name. */
  holder: string | null
  /** Cédula / RIF / tax id — what a Pago Móvil transfer asks for. */
  document: string | null
  note: string | null
}

const MAX_ACCOUNTS = 12
const MAX_FIELD = 120

function field(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, MAX_FIELD) : null
}

/**
 * Read whatever is stored and hand back something safe to render.
 *
 * Tolerant by design — this parses a JSONB blob that an older client, a seed
 * script or a hand-edited row may have written. A malformed entry is dropped,
 * never thrown over: a typo in one account must not take down the checkout page
 * that shows the other three.
 */
export function normalizeManualPaymentAccounts(value: unknown): ManualPaymentAccount[] {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray((value as { accounts?: unknown } | null)?.accounts)
      ? (value as { accounts: unknown[] }).accounts
      : []

  const accounts: ManualPaymentAccount[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const method = field(row.method)
    // An account with no method is unusable on both sides: the student cannot
    // tell what it is and the admin cannot tell where to look.
    if (!method) continue
    accounts.push({
      id: field(row.id) || `${accounts.length + 1}`,
      method,
      bank: field(row.bank),
      identifier: field(row.identifier),
      holder: field(row.holder),
      document: field(row.document),
      note: field(row.note),
    })
    if (accounts.length >= MAX_ACCOUNTS) break
  }
  return accounts
}

/** One-line label for a select option or an admin table cell. */
export function manualPaymentAccountLabel(account: ManualPaymentAccount): string {
  return [account.method, account.bank, account.identifier].filter(Boolean).join(' · ')
}
