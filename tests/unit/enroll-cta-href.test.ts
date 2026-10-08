import { describe, expect, it } from 'vitest'
import {
  courseCheckoutHref,
  enrollCtaTarget,
  isFreePrice,
  planCheckoutHref,
  productHref,
} from '@/lib/puck/utils/checkout-href'
import { formatMoney } from '@/lib/puck/utils/format-money'

describe('enrollCtaTarget (EnrollCta href + label)', () => {
  it('no course bound → generic catalog CTA', () => {
    expect(enrollCtaTarget(null)).toEqual({ href: '/courses', label: 'browseCourses' })
    expect(enrollCtaTarget(undefined)).toEqual({ href: '/courses', label: 'browseCourses' })
  })

  it('free course → one-click enroll deep link (not checkout)', () => {
    expect(enrollCtaTarget({ id: '12', price: null })).toEqual({ href: '/courses/12?enroll=1', label: 'enrollFree' })
    expect(enrollCtaTarget({ id: '12', price: 0 })).toEqual({ href: '/courses/12?enroll=1', label: 'enrollFree' })
  })

  it('paid course → checkout by courseId (checkout routes manual providers on)', () => {
    expect(enrollCtaTarget({ id: '12', price: 49 })).toEqual({ href: '/checkout?courseId=12', label: 'enrollPaid' })
  })

  it('encodes the id so a hostile prop cannot inject query params', () => {
    expect(courseCheckoutHref({ id: '1&planId=2', price: 10 })).toBe('/checkout?courseId=1%26planId%3D2')
  })
})

describe('productHref', () => {
  it('one-course product → that course checkout path, priced by the product', () => {
    expect(productHref({ id: '40', courseIds: ['12'], price: 30 })).toBe('/checkout?courseId=12')
    expect(productHref({ id: '40', courseIds: ['12'], price: 0 })).toBe('/courses/12?enroll=1')
  })

  it('bundle (or no linked course) → product page', () => {
    expect(productHref({ id: '40', courseIds: ['12', '13'], price: 30 })).toBe('/products/40')
    expect(productHref({ id: '40', courseIds: [], price: 30 })).toBe('/products/40')
  })
})

describe('plan + price helpers', () => {
  it('plan checkout', () => {
    expect(planCheckoutHref('8')).toBe('/checkout?planId=8')
  })

  it('isFreePrice', () => {
    expect(isFreePrice(null)).toBe(true)
    expect(isFreePrice(0)).toBe(true)
    expect(isFreePrice(0.5)).toBe(false)
  })

  it('formatMoney uses the page locale and upper-cases the stored currency', () => {
    expect(formatMoney(49, 'usd', 'en')).toBe('$49')
    expect(formatMoney(49.5, 'eur', 'es')).toMatch(/49,50\s?€/)
    expect(formatMoney(0, 'usd', 'en')).toBeNull()
    expect(formatMoney(null, 'usd', 'en')).toBeNull()
    expect(formatMoney(10, 'not-a-currency', 'en')).toBe('10 NOT-A-CURRENCY')
  })
})
