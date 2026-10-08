/**
 * Pure helpers behind the school-level tools (#898).
 *
 * `mcp-server` is bundled and deployed standalone (Docker context
 * `./mcp-server`), so it cannot import the app's `lib/`. These mirror the
 * pieces of `lib/countries.ts` (#865) and `lib/settings/general-settings.ts`
 * (#890) the settings tools need; `tests/school-tools.test.ts` imports the
 * root modules and compares the constants, the normalizers and
 * `buildSettingsRows` against root `normalizeGeneralSettings` (the #890 gate),
 * so it fails the moment the two drift.
 */

// ─── Country / currency (lib/countries.ts) ───────────────────────────────────

/** Every officially assigned ISO 3166-1 alpha-2 code. */
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const COUNTRY_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

/** `'co'`, `' CO '` → `'CO'`; anything that is not an assigned ISO code → `null`. */
export function normalizeCountry(input: unknown): CountryCode | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return COUNTRY_SET.has(code) ? (code as CountryCode) : null;
}

/** Country → the currency a school there most likely sells in. */
export const COUNTRY_CURRENCY: Readonly<Partial<Record<CountryCode, string>>> = {
  AR: "ARS", BO: "BOB", BR: "BRL", CL: "CLP", CO: "COP", CR: "CRC", DO: "DOP",
  EC: "USD", GT: "GTQ", HN: "HNL", MX: "MXN", NI: "NIO", PA: "USD", PE: "PEN",
  PR: "USD", PY: "PYG", SV: "USD", UY: "UYU", VE: "USD",
  US: "USD", CA: "CAD",
  GB: "GBP", AU: "AUD", NZ: "NZD", IN: "INR", ZA: "ZAR", SG: "SGD", PH: "PHP",
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR", FI: "EUR",
  FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR", IT: "EUR", LT: "EUR", LU: "EUR",
  LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR", SK: "EUR",
  CH: "CHF", CZ: "CZK", DK: "DKK", HU: "HUF", NO: "NOK", PL: "PLN", RO: "RON", SE: "SEK",
  JP: "JPY",
};

/** The default currency for a country, or `null` when there is no answer. */
export function defaultCurrencyForCountry(country: string | null | undefined): string | null {
  const code = normalizeCountry(country);
  return code ? COUNTRY_CURRENCY[code] ?? null : null;
}

/** Every currency a school can pick as its default (the payment settings select). */
export const SCHOOL_CURRENCIES: readonly string[] = Array.from(
  new Set(Object.values(COUNTRY_CURRENCY) as string[])
).sort();

/** A `currency` setting counts as "not chosen" with no row or a blank value. */
export function isCurrencySettingEmpty(settingValue: unknown): boolean {
  if (!settingValue || typeof settingValue !== "object") return true;
  const value = (settingValue as { value?: unknown }).value;
  return typeof value !== "string" || value.trim() === "";
}

// ─── General settings (lib/settings/general-settings.ts) ─────────────────────

export const MAX_SITE_NAME_LENGTH = 120;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_SITE_DESCRIPTION_LENGTH = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Blank → `null`; non-blank must look like an address. */
export function normalizeOptionalEmail(
  raw: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_EMAIL_LENGTH) return { ok: false };
  return EMAIL_RE.test(trimmed) ? { ok: true, value: trimmed } : { ok: false };
}

/** An IANA zone the runtime knows (`America/Bogota`), never a guess. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.trim() !== tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Blank → `''` (cleared, the `resetSetting` default); otherwise an http(s) URL. */
export function normalizeAssetUrl(raw: string): { ok: true; value: string } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: "" };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false };
  }
}

// ─── Manual payment accounts (lib/payments/manual-payment-accounts.ts, #802) ─

export const MANUAL_PAYMENT_KINDS = [
  "zelle",
  "binance",
  "paypal",
  "zinli",
  "cash",
  "pago_movil",
] as const;

export type ManualPaymentKind = (typeof MANUAL_PAYMENT_KINDS)[number];

export interface ManualPaymentAccount {
  id: string;
  kind: ManualPaymentKind | null;
  method: string;
  bank: string | null;
  identifier: string | null;
  email: string | null;
  holder: string | null;
  document: string | null;
  note: string | null;
}

/** Brand names stored in `method` when a preset row has none of its own. */
const MANUAL_KIND_METHOD: Record<ManualPaymentKind, string> = {
  zelle: "Zelle",
  binance: "Binance",
  paypal: "PayPal",
  zinli: "Zinli",
  cash: "Cash",
  pago_movil: "Pago Móvil",
};

const MAX_ACCOUNTS = 12;
const MAX_FIELD = 120;
const MAX_NOTE = 500;

function isManualPaymentKind(value: unknown): value is ManualPaymentKind {
  return typeof value === "string" && (MANUAL_PAYMENT_KINDS as readonly string[]).includes(value);
}

function accountField(value: unknown, max = MAX_FIELD): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, max) : null;
}

function noteField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? cleaned.slice(0, MAX_NOTE) : null;
}

/**
 * Mirror of root `normalizeManualPaymentAccounts` (#802, catalog #926): kinds,
 * preset ids, notes, unique ids. Only the known keys are copied, so any extra
 * field (api_key, credentials, ...) is dropped. Accepts the bare array or the
 * stored `{ accounts: [...] }` shape. Keep in sync with the root file; the
 * parity test in tests/school-tools.test.ts fails on drift.
 */
export function normalizeManualPaymentAccounts(value: unknown): ManualPaymentAccount[] {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray((value as { accounts?: unknown } | null)?.accounts)
      ? (value as { accounts: unknown[] }).accounts
      : [];

  const accounts: ManualPaymentAccount[] = [];
  const seenKinds = new Set<ManualPaymentKind>();
  const seenIds = new Set<string>();
  const reserved = new Set<string>();
  for (const entry of raw) {
    const id = entry && typeof entry === "object" ? accountField((entry as Record<string, unknown>).id) : null;
    if (id) reserved.add(id);
  }
  const freshId = () => {
    let n = accounts.length + 1;
    while (seenIds.has(`acct-${n}`) || reserved.has(`acct-${n}`)) n++;
    return `acct-${n}`;
  };
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    let kind = isManualPaymentKind(row.kind) ? row.kind : null;
    if (kind) {
      if (seenKinds.has(kind)) kind = null;
      else seenKinds.add(kind);
    }
    const method = accountField(row.method) ?? (kind ? MANUAL_KIND_METHOD[kind] : null);
    if (!method) continue;
    const stored = accountField(row.id);
    let id = stored || (kind ? `preset-${kind}` : null);
    if (!id || seenIds.has(id) || (!kind && id.startsWith("preset-"))) id = freshId();
    seenIds.add(id);
    accounts.push({
      id,
      kind,
      method,
      bank: accountField(row.bank),
      identifier: accountField(row.identifier),
      email: accountField(row.email),
      holder: accountField(row.holder),
      document: accountField(row.document),
      note: noteField(row.note),
    });
    if (accounts.length >= MAX_ACCOUNTS) break;
  }
  return accounts;
}

/** `tenant_settings.setting_value` — `{ value }`, `{ enabled }` or `{ accounts }`. */
export type SettingValue = {
  value?: string | number | null;
  enabled?: boolean;
  accounts?: ManualPaymentAccount[];
};

/** What `lms_update_school_settings` accepts — every field optional. */
export interface SchoolSettingsInput {
  site_name?: string;
  site_description?: string;
  contact_email?: string;
  support_email?: string;
  timezone?: string;
  logo_url?: string;
  favicon_url?: string;
  currency?: string;
  allow_self_enrollment?: boolean;
  auto_enrollment?: boolean;
  require_enrollment_approval?: boolean;
  course_capacity_enabled?: boolean;
  free_preview_enabled?: boolean;
  max_enrollments_per_user?: number;
  enrollment_expiration_days?: number;
  /** Raw list (or `{ accounts }`); stored normalized as `{ accounts }`. */
  manual_payment_accounts?: unknown;
}

const BOOLEAN_KEYS = [
  "allow_self_enrollment",
  "auto_enrollment",
  "require_enrollment_approval",
  "course_capacity_enabled",
  "free_preview_enabled",
] as const;

const INTEGER_KEYS = ["max_enrollments_per_user", "enrollment_expiration_days"] as const;

/**
 * Turn the tool input into `tenant_settings` rows, applying the same gate the
 * web `updateSettings` action does (#890: site_name trimmed, blank → null,
 * capped; emails blank → null or validated) plus checks the forms imply
 * (a real time zone, a listed currency, http(s) asset URLs). The theme key is
 * never produced here — `lms_set_school_theme` is its only writer, as
 * `applyKitTheme` is on the web (#763).
 */
export function buildSettingsRows(
  input: SchoolSettingsInput
): { ok: true; settings: Record<string, SettingValue> } | { ok: false; error: string } {
  const out: Record<string, SettingValue> = {};

  if (input.site_name !== undefined) {
    const name = input.site_name.trim();
    if (name.length > MAX_SITE_NAME_LENGTH) {
      return { ok: false, error: `site_name must be at most ${MAX_SITE_NAME_LENGTH} characters.` };
    }
    out.site_name = { value: name === "" ? null : name };
  }

  if (input.site_description !== undefined) {
    const description = input.site_description.trim();
    if (description.length > MAX_SITE_DESCRIPTION_LENGTH) {
      return {
        ok: false,
        error: `site_description must be at most ${MAX_SITE_DESCRIPTION_LENGTH} characters.`,
      };
    }
    out.site_description = { value: description };
  }

  for (const key of ["contact_email", "support_email"] as const) {
    if (input[key] === undefined) continue;
    const email = normalizeOptionalEmail(input[key]);
    if (!email.ok) return { ok: false, error: `${key} is not a valid email address.` };
    out[key] = { value: email.value };
  }

  if (input.timezone !== undefined) {
    if (!isValidTimeZone(input.timezone)) {
      return { ok: false, error: `'${input.timezone}' is not an IANA time zone (e.g. America/Bogota).` };
    }
    out.timezone = { value: input.timezone };
  }

  for (const key of ["logo_url", "favicon_url"] as const) {
    if (input[key] === undefined) continue;
    const url = normalizeAssetUrl(input[key] as string);
    if (!url.ok) return { ok: false, error: `${key} must be an http(s) URL, or empty to clear it.` };
    out[key] = { value: url.value };
  }

  if (input.currency !== undefined) {
    const currency = input.currency.trim().toUpperCase();
    if (!SCHOOL_CURRENCIES.includes(currency)) {
      return {
        ok: false,
        error: `Currency '${input.currency}' is not offered. Choose one of: ${SCHOOL_CURRENCIES.join(", ")}.`,
      };
    }
    out.currency = { value: currency };
  }

  for (const key of BOOLEAN_KEYS) {
    if (input[key] !== undefined) out[key] = { enabled: input[key] };
  }

  for (const key of INTEGER_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, error: `${key} must be a whole number ≥ 0 (0 = no limit).` };
    }
    out[key] = { value };
  }

  if (input.manual_payment_accounts !== undefined) {
    out.manual_payment_accounts = {
      accounts: normalizeManualPaymentAccounts(input.manual_payment_accounts),
    };
  }

  return { ok: true, settings: out };
}

// ─── Reading settings back ──────────────────────────────────────────────────

/** Category per key — `getAllSettingsByCategory` in app/actions/admin/settings.ts. */
const SETTING_CATEGORY: Record<string, string> = {
  site_name: "general", site_description: "general", contact_email: "general",
  support_email: "general", timezone: "general", maintenance_mode: "general",
  logo_url: "general", favicon_url: "general",
  smtp_host: "email", smtp_port: "email", smtp_username: "email", smtp_password: "email",
  smtp_from_email: "email", smtp_from_name: "email", email_notifications: "email",
  stripe_enabled: "payment", paypal_enabled: "payment", binance_enabled: "payment",
  binance_personal_enabled: "payment", lemonsqueezy_enabled: "payment", solana_enabled: "payment",
  solana_accept_sol: "payment", currency: "payment", tax_rate: "payment",
  invoice_prefix: "payment", require_payment_approval: "payment",
  manual_payment_instructions: "payment", manual_payment_accounts: "payment",
  auto_enrollment: "enrollment", require_enrollment_approval: "enrollment",
  max_enrollments_per_user: "enrollment", allow_self_enrollment: "enrollment",
  enrollment_expiration_days: "enrollment", course_capacity_enabled: "enrollment",
  free_preview_enabled: "enrollment",
};

export function settingCategory(key: string): string {
  return SETTING_CATEGORY[key] ?? "general";
}

const SECRET_KEY = /(password|secret|token|api_?key|private|credential)/i;

/**
 * Whether a setting's value must never reach the model. A credential pasted
 * into a chat transcript is a leaked credential; the tool reports only that
 * it is set.
 */
export function isSecretSettingKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** `{ category: { key: value } }`, secrets reduced to `{ redacted: true, set }`. */
export function groupSettings(
  rows: { setting_key: string; setting_value: unknown }[],
  skipKeys: ReadonlySet<string> = new Set()
): Record<string, Record<string, unknown>> {
  const grouped: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (skipKeys.has(row.setting_key)) continue;
    const category = settingCategory(row.setting_key);
    grouped[category] ??= {};
    if (isSecretSettingKey(row.setting_key)) {
      const raw = (row.setting_value as { value?: unknown } | null)?.value;
      grouped[category][row.setting_key] = {
        redacted: true,
        set: typeof raw === "string" ? raw !== "" : raw !== null && raw !== undefined,
      };
    } else {
      grouped[category][row.setting_key] = row.setting_value;
    }
  }
  return grouped;
}
