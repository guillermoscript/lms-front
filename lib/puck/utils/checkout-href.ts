/**
 * Where a landing-page CTA sends a buyer. Pure: shared by EnrollCta, CourseHero,
 * CoursePricingCard, ProductGrid, PricingTable and the landing-data resolver.
 *
 *  - Free course   → `/courses/{id}?enroll=1` (the one-click enroll flow; the
 *                    course page also handles a logged-out visitor).
 *  - Paid course   → `/checkout?courseId={id}`. Checkout itself routes a free
 *                    course to enroll and a `manual` provider to
 *                    `/checkout/manual`, so this is right even when the price
 *                    we know is stale.
 *  - Product       → a product linked to exactly ONE course goes through that
 *                    course's checkout; a bundle goes to `/products/{id}`
 *                    (there is no product checkout — owner decision).
 *  - Plan          → `/checkout?planId={id}`.
 */

export interface CheckoutCourse {
  id: string
  price: number | null
}

export function isFreePrice(price: number | null | undefined): boolean {
  return price == null || Number(price) <= 0
}

export function courseCheckoutHref(course: CheckoutCourse): string {
  const id = encodeURIComponent(course.id)
  return isFreePrice(course.price) ? `/courses/${id}?enroll=1` : `/checkout?courseId=${id}`
}

export function productHref(product: { id: string; courseIds: string[]; price: number | null }): string {
  if (product.courseIds.length === 1) {
    // The product's own price decides free vs paid; checkout re-routes anyway.
    return courseCheckoutHref({ id: product.courseIds[0], price: product.price })
  }
  return `/products/${encodeURIComponent(product.id)}`
}

export function planCheckoutHref(planId: string): string {
  return `/checkout?planId=${encodeURIComponent(planId)}`
}

export type EnrollCtaLabel = 'enrollFree' | 'enrollPaid' | 'browseCourses'

/**
 * EnrollCta's target. No course bound → a generic catalog CTA. A bound course
 * → the free-enroll or checkout path, with a label key that reflects the price.
 * (A bound course that does not resolve is handled by the block: it renders
 * nothing publicly.)
 */
export function enrollCtaTarget(course: CheckoutCourse | null | undefined): {
  href: string
  label: EnrollCtaLabel
} {
  if (!course) return { href: '/courses', label: 'browseCourses' }
  return {
    href: courseCheckoutHref(course),
    label: isFreePrice(course.price) ? 'enrollFree' : 'enrollPaid',
  }
}
