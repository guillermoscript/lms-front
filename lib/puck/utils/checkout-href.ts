/**
 * Where a landing-page CTA sends a buyer. Pure: shared by EnrollCta, CourseHero,
 * CoursePricingCard, ProductGrid, PricingTable and the landing-data resolver.
 *
 *  - Free course   → `/courses/{id}?enroll=1` (the one-click enroll flow; the
 *                    course page also handles a logged-out visitor).
 *  - Paid course   → `/checkout?courseId={id}` (checkout charges the cheapest
 *                    active paid product: the price the blocks show). Checkout itself routes a free
 *                    course to enroll and a `manual` provider to
 *                    `/checkout/manual`, so this is right even when the price
 *                    we know is stale.
 *  - Product       → a product linked to exactly ONE course goes through that
 *                    course's checkout with `&productId=`; a bundle goes to `/products/{id}`
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

/**
 * `productId` pins the product checkout charges (it must be an active paid product of the
 * course; checkout ignores it otherwise). Without it checkout charges the course's cheapest
 * active paid product, the same price the landing blocks show.
 */
export function courseCheckoutHref(course: CheckoutCourse, productId?: string): string {
  const id = encodeURIComponent(course.id)
  if (isFreePrice(course.price)) return `/courses/${id}?enroll=1`
  return productId ? `/checkout?courseId=${id}&productId=${encodeURIComponent(productId)}` : `/checkout?courseId=${id}`
}

export function productHref(product: { id: string; courseIds: string[]; price: number | null }): string {
  if (product.courseIds.length === 1) {
    // The product's own price decides free vs paid, and checkout charges THIS product.
    return courseCheckoutHref({ id: product.courseIds[0], price: product.price }, product.id)
  }
  return `/products/${encodeURIComponent(product.id)}`
}

/** A `product_courses` row with its product, as checkout reads it. */
export interface CourseProductLink {
  product_id: number
  product: {
    price: number | string
    currency: string | null
    payment_provider: string | null
    description: string | null
    status: string | null
  } | null
}

/**
 * Which product a course checkout charges. The landing blocks advertise the cheapest ACTIVE
 * paid product (landing-data.ts `getCoursePrices`), so that is the default; a requested
 * `productId` wins when it is an active paid product of this course. A course whose paid
 * products are all inactive keeps the old behaviour (the first paid one).
 */
export function pickCourseCheckoutProduct(
  links: CourseProductLink[] | null | undefined,
  requestedProductId?: string
): CourseProductLink | undefined {
  const paid = (links ?? []).filter((l) => l.product !== null && Number(l.product.price) > 0)
  const active = paid.filter((l) => l.product?.status === 'active')
  if (requestedProductId) {
    const match = active.find((l) => String(l.product_id) === requestedProductId)
    if (match) return match
  }
  if (active.length) return active.reduce((min, l) => (Number(l.product!.price) < Number(min.product!.price) ? l : min))
  return paid[0]
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
