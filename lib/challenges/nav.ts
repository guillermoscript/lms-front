interface NavLike<S extends { href: string }> {
  href: string
  items?: S[]
}

const CHALLENGES_HREF = /^\/dashboard\/(student|teacher)\/challenges(\/|$)/

/** Drops the Retos entries (top level or nested) when the school has challenges off. */
export function withoutChallenges<S extends { href: string }, T extends NavLike<S>>(items: T[], enabled: boolean): T[] {
  if (enabled) return items
  return items
    .filter((item) => !CHALLENGES_HREF.test(item.href))
    .map((item) => (item.items ? { ...item, items: item.items.filter((s) => !CHALLENGES_HREF.test(s.href)) } : item))
}
