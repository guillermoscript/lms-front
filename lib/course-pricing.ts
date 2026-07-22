export interface LinkedProduct {
  price: number | string
  currency: string | null
}

/**
 * Deterministic product pick for a course linked to multiple products
 * (product_courses is many-to-many — never assume one row): the cheapest
 * paid product wins, else the first linked product, else null. The catalog
 * cards, the course detail page, and the JSON-LD Offer must all agree on
 * the price a visitor sees, so they all go through this helper.
 */
export function pickCourseProduct<T extends LinkedProduct>(products: (T | null | undefined)[]): T | null {
  const linked = products.filter((product): product is T => product != null)
  const paid = linked
    .filter((product) => Number(product.price) > 0)
    .sort((a, b) => Number(a.price) - Number(b.price))
  return paid[0] ?? linked[0] ?? null
}
