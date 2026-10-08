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
 *
 * Two flavours of row share one shape:
 *  - a PRESET row (`kind` set): one of {@link MANUAL_PAYMENT_KINDS}, edited
 *    through a per-method form, id fixed to `preset-<kind>` so there is at most
 *    one per method and `paid_to_account` references stay meaningful;
 *  - a CUSTOM row (`kind` null): the original free-text row. Every row written
 *    before the catalog existed is one of these and keeps working untouched.
 *
 * MCP mirror: `mcp-server/src/school-settings.ts` re-implements
 * `normalizeManualPaymentAccounts` (the mcp-server image cannot import `lib/`).
 * Change the normalizer here and update the mirror too;
 * `mcp-server/tests/school-tools.test.ts` compares the two and fails on drift.
 *
 * Secrets never live here. This blob is student-readable (checkout shows it), so
 * the Binance read-only API key goes to `tenant_payment_wallets`, encrypted.
 */

export const MANUAL_PAYMENT_KINDS = [
  'zelle',
  'binance',
  'paypal',
  'zinli',
  'cash',
  'pago_movil',
] as const

export type ManualPaymentKind = (typeof MANUAL_PAYMENT_KINDS)[number]

export interface ManualPaymentAccount {
  /** Stable across edits so a student's `paid_to_account` keeps meaning something. */
  id: string
  /** Preset this row was configured from; null for a custom / legacy row. */
  kind: ManualPaymentKind | null
  /** "Pago Móvil", "Zelle", "Transferencia", "Binance" — the school's own words. */
  method: string
  bank: string | null
  /** Phone, account number, Binance Pay ID — whatever the method needs. */
  identifier: string | null
  /** Where the money goes, for the methods that are addressed by email. */
  email: string | null
  /** Account holder, when it differs from the school's own name. */
  holder: string | null
  /** Cédula / RIF / tax id — what a Pago Móvil transfer asks for. */
  document: string | null
  /** Extra instructions. Longer allowance than the other fields. */
  note: string | null
}

export type ManualPaymentFieldKey = 'email' | 'identifier' | 'bank' | 'holder' | 'document' | 'note'

export interface ManualPaymentFieldSpec {
  key: ManualPaymentFieldKey
  required: boolean
  /** Multi-line input. */
  multiline?: boolean
}

/**
 * Which fields each preset asks for, in display order. The single source for
 * the admin modal, the completeness check and the student-facing list.
 */
export const MANUAL_KIND_FIELDS: Record<ManualPaymentKind, ManualPaymentFieldSpec[]> = {
  zelle: [
    { key: 'email', required: true },
    { key: 'holder', required: false },
    { key: 'note', required: false, multiline: true },
  ],
  binance: [
    { key: 'email', required: false },
    { key: 'identifier', required: true },
    { key: 'note', required: false, multiline: true },
  ],
  paypal: [
    { key: 'email', required: true },
    { key: 'note', required: false, multiline: true },
  ],
  zinli: [
    { key: 'email', required: true },
    { key: 'holder', required: false },
    { key: 'note', required: false, multiline: true },
  ],
  cash: [{ key: 'note', required: true, multiline: true }],
  pago_movil: [
    { key: 'bank', required: true },
    { key: 'identifier', required: true },
    { key: 'document', required: true },
    { key: 'holder', required: false },
    { key: 'note', required: false, multiline: true },
  ],
}

/** Brand names stored in `method` when a row has none of its own. */
export const MANUAL_KIND_METHOD: Record<ManualPaymentKind, string> = {
  zelle: 'Zelle',
  binance: 'Binance',
  paypal: 'PayPal',
  zinli: 'Zinli',
  cash: 'Cash',
  pago_movil: 'Pago Móvil',
}

export const MAX_ACCOUNTS = 12
const MAX_FIELD = 120
const MAX_NOTE = 500

export function isManualPaymentKind(value: unknown): value is ManualPaymentKind {
  return typeof value === 'string' && (MANUAL_PAYMENT_KINDS as readonly string[]).includes(value)
}

/** Stable id for a preset row: one per method, per school. */
export function manualPaymentPresetId(kind: ManualPaymentKind): string {
  return `preset-${kind}`
}

function field(value: unknown, max = MAX_FIELD): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, max) : null
}

/**
 * Notes are instructions, so line breaks matter: collapse runs of spaces within
 * a line and cap blank lines, but keep the lines themselves.
 */
function noteField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned ? cleaned.slice(0, MAX_NOTE) : null
}

/**
 * Read whatever is stored and hand back something safe to render.
 *
 * Tolerant by design — this parses a JSONB blob that an older client, a seed
 * script, an MCP write or a hand-edited row may have written. A malformed entry
 * is dropped, never thrown over: a typo in one account must not take down the
 * checkout page that shows the other three.
 *
 * Idempotent, and run on both read and write — so every key this shape gains
 * MUST be copied here, or it silently vanishes on the next save.
 */
export function normalizeManualPaymentAccounts(value: unknown): ManualPaymentAccount[] {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray((value as { accounts?: unknown } | null)?.accounts)
      ? (value as { accounts: unknown[] }).accounts
      : []

  const accounts: ManualPaymentAccount[] = []
  const seenKinds = new Set<ManualPaymentKind>()
  // Ids must be unique: the editor upserts / removes by id and React keys on it.
  // `reserved` holds every explicit id so a generated one never steals it.
  const seenIds = new Set<string>()
  const reserved = new Set<string>()
  for (const entry of raw) {
    const id = entry && typeof entry === 'object' ? field((entry as Record<string, unknown>).id) : null
    if (id) reserved.add(id)
  }
  const freshId = () => {
    let n = accounts.length + 1
    while (seenIds.has(`acct-${n}`) || reserved.has(`acct-${n}`)) n++
    return `acct-${n}`
  }
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    let kind = isManualPaymentKind(row.kind) ? row.kind : null
    // One row per preset: a second "Zelle" is a duplicate, not a second account
    // (custom rows are how a school lists two of the same thing).
    if (kind) {
      if (seenKinds.has(kind)) kind = null
      else seenKinds.add(kind)
    }
    // A preset row names itself; a custom row must, or it is unusable on both
    // sides (the student cannot tell what it is, the admin where to look).
    const method = field(row.method) ?? (kind ? MANUAL_KIND_METHOD[kind] : null)
    if (!method) continue
    const stored = field(row.id)
    // A demoted duplicate (kind null) must not keep a `preset-*` id, and no id
    // may repeat; either gets a fresh one.
    let id = stored || (kind ? manualPaymentPresetId(kind) : null)
    if (!id || seenIds.has(id) || (!kind && id.startsWith('preset-'))) id = freshId()
    seenIds.add(id)
    accounts.push({
      id,
      kind,
      method,
      bank: field(row.bank),
      identifier: field(row.identifier),
      email: field(row.email),
      holder: field(row.holder),
      document: field(row.document),
      note: noteField(row.note),
    })
    if (accounts.length >= MAX_ACCOUNTS) break
  }
  return accounts
}

/** One-line label for a select option or an admin table cell. */
export function manualPaymentAccountLabel(account: ManualPaymentAccount): string {
  // `email` stands in for the identifier on rows addressed by email, so the
  // label of a kind-less row is byte-for-byte what it always was.
  // Clamped to the 120 chars `paid_to_account` accepts, so three long fields
  // can never make `reportManualPayment` fail with "Account is too long".
  return [account.method, account.bank, account.identifier ?? account.email]
    .filter(Boolean)
    .join(' · ')
    .slice(0, MAX_FIELD)
}

/** True when every required field of a preset is filled. Custom rows only need a method. */
export function isManualPaymentAccountComplete(account: ManualPaymentAccount): boolean {
  if (!account.kind) return Boolean(account.method)
  return MANUAL_KIND_FIELDS[account.kind].every(
    (spec) => !spec.required || Boolean(account[spec.key]),
  )
}

/** An empty preset row, ready to be filled by the modal. */
export function blankPresetAccount(kind: ManualPaymentKind, method?: string): ManualPaymentAccount {
  return {
    id: manualPaymentPresetId(kind),
    kind,
    method: method?.trim() || MANUAL_KIND_METHOD[kind],
    bank: null,
    identifier: null,
    email: null,
    holder: null,
    document: null,
    note: null,
  }
}

/** The configured row for a preset, if the school has one. */
export function findPresetAccount(
  accounts: ManualPaymentAccount[],
  kind: ManualPaymentKind,
): ManualPaymentAccount | undefined {
  return accounts.find((a) => a.kind === kind)
}

export type ManualPaymentValidationError = 'required' | 'email' | 'phone' | 'document'

export interface ManualPaymentValidation {
  ok: boolean
  errors: Partial<Record<ManualPaymentFieldKey, ManualPaymentValidationError>>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAGO_MOVIL_DOCUMENT_RE = /^[VEJGPCvejgpc]?-?\d{5,10}(-?\d)?$/

/**
 * What the admin modal checks before it accepts a preset. UI-only: it never
 * rejects a save, so legacy rows and MCP writes keep working — an incomplete
 * row is simply stored and hidden from students.
 */
export function validateManualPaymentAccount(account: ManualPaymentAccount): ManualPaymentValidation {
  const errors: ManualPaymentValidation['errors'] = {}
  if (!account.kind) return { ok: true, errors }

  for (const spec of MANUAL_KIND_FIELDS[account.kind]) {
    const value = (account[spec.key] ?? '').trim()
    if (!value) {
      if (spec.required) errors[spec.key] = 'required'
      continue
    }
    if (spec.key === 'email' && !EMAIL_RE.test(value)) errors.email = 'email'
  }

  if (account.kind === 'pago_movil') {
    const phone = (account.identifier ?? '').replace(/[\s-]/g, '').replace(/^\+/, '')
    if (!errors.identifier && account.identifier && !/^\d{7,15}$/.test(phone)) {
      errors.identifier = 'phone'
    }
    if (!errors.document && account.document && !PAGO_MOVIL_DOCUMENT_RE.test(account.document.trim())) {
      errors.document = 'document'
    }
  }

  return { ok: Object.keys(errors).length === 0, errors }
}
