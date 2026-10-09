/** Pure account selection; safe to import from client components. */

/**
 * The accounts a school may pay a `currency` balance into: the active
 * account(s) in that currency, else the active USD account(s), else none.
 * Pure; `active` must already be active-only and ordered.
 */
export function selectBankAccountsFor<T extends { currency: string }>(active: readonly T[], currency: string): T[] {
  const want = currency.trim().toUpperCase()
  const exact = active.filter((a) => a.currency === want)
  return exact.length > 0 ? exact : active.filter((a) => a.currency === 'USD')
}

/** Union of `selectBankAccountsFor` over several currencies, de-duplicated by id, order kept. Pure. */
export function selectBankAccountsForAll<T extends { id: string; currency: string }>(
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
