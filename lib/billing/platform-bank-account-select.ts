/** Pure account selection; safe to import from client components. */

/**
 * The accounts a school may pay a `currency` balance into: the active
 * account(s) in that currency, else the active USD account(s), else none.
 * Pago Móvil is always offered on top: it is a VES rail for a balance owed in
 * USD, so the amount is converted for display (see `ves-rate.ts`). Order of
 * `active` is kept. Pure; `active` must already be active-only and ordered.
 */
export function selectBankAccountsFor<T extends { currency: string; kind?: string }>(active: readonly T[], currency: string): T[] {
  const want = currency.trim().toUpperCase()
  const exact = active.filter((a) => a.currency === want)
  const base = exact.length > 0 ? exact : active.filter((a) => a.currency === 'USD')
  const chosen = new Set<T>(base)
  return active.filter((a) => chosen.has(a) || a.kind === 'pago_movil')
}

/** Union of `selectBankAccountsFor` over several currencies, de-duplicated by id, order kept. Pure. */
export function selectBankAccountsForAll<T extends { id: string; currency: string; kind?: string }>(
  active: readonly T[],
  currencies: readonly string[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const c of currencies) {
    for (const a of selectBankAccountsFor(active, c)) {
      if (!seen.has(a.id)) {
        seen.add(a.id)
        out.push(a)
      }
    }
  }
  return out
}
