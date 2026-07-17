import { describe, expect, it } from 'vitest'
import {
  getProductCreationReadiness,
  validatePostRegistrationStep,
} from '@/lib/admin/product-creation/validation'

describe('product creation validation', () => {
  it('allows draft save with a new course title', () => {
    const readiness = getProductCreationReadiness({
      intent: 'draft',
      course: {
        sourceMode: 'new',
        title: 'Intro to Product Design',
        description: '',
        thumbnailUrl: '',
        categoryId: null,
      },
      pricing: { mode: 'free' },
      postRegistrationSteps: [],
    })

    expect(readiness.canSaveDraft).toBe(true)
    expect(readiness.canPublish).toBe(true)
    expect(readiness.issues).toEqual([])
  })

  it('blocks draft save for existing course mode without course id', () => {
    const readiness = getProductCreationReadiness({
      intent: 'draft',
      course: {
        sourceMode: 'existing',
        title: 'Existing Course',
      },
      pricing: { mode: 'free' },
      postRegistrationSteps: [],
    })

    expect(readiness.canSaveDraft).toBe(false)
    expect(readiness.canPublish).toBe(false)
    expect(readiness.issues).toContainEqual({
      field: 'course.existingCourseId',
      message: 'Select a course.',
    })
  })

  it('requires paid price, currency, and provider before publish', () => {
    const readiness = getProductCreationReadiness({
      intent: 'publish',
      course: {
        sourceMode: 'new',
        title: 'Paid Course',
      },
      pricing: { mode: 'paid', price: 0 },
      postRegistrationSteps: [],
    })

    expect(readiness.canSaveDraft).toBe(true)
    expect(readiness.canPublish).toBe(false)
    expect(readiness.issues).toContainEqual({
      field: 'pricing.price',
      message: 'Enter a price greater than 0.',
    })
    expect(readiness.issues).toContainEqual({
      field: 'pricing.currency',
      message: 'Select a currency.',
    })
    expect(readiness.issues).toContainEqual({
      field: 'pricing.paymentProvider',
      message: 'Select a payment method.',
    })
  })

  it('allows paid publish when pricing requirements and post-registration steps are valid', () => {
    const readiness = getProductCreationReadiness({
      intent: 'publish',
      course: {
        sourceMode: 'new',
        title: 'Paid Course',
      },
      pricing: {
        mode: 'paid',
        price: 99,
        currency: 'usd',
        paymentProvider: 'manual',
      },
      postRegistrationSteps: [
        {
          type: 'link',
          title: 'Join the community',
          url: 'https://example.com/community',
          sortOrder: 0,
          isActive: true,
        },
      ],
    })

    expect(readiness.canSaveDraft).toBe(true)
    expect(readiness.canPublish).toBe(true)
    expect(readiness.issues).toEqual([])
  })

  it('accepts valid post-registration text step without url', () => {
    const result = validatePostRegistrationStep({
      type: 'text',
      title: 'Welcome note',
      description: 'Check your email.',
      sortOrder: 0,
      isActive: true,
    })

    expect(result).toEqual([])
  })

  it('rejects invalid post-registration url', () => {
    const result = validatePostRegistrationStep({
      type: 'whatsapp',
      title: 'Join WhatsApp',
      url: 'not-a-url',
      sortOrder: 0,
      isActive: true,
    })

    expect(result).toContainEqual({
      field: 'postRegistrationSteps.url',
      message: 'Enter a valid URL.',
    })
  })

  it('requires a url for URL-based active post-registration steps', () => {
    const result = validatePostRegistrationStep({
      type: 'discord',
      title: 'Join Discord',
      sortOrder: 0,
      isActive: true,
    })

    expect(result).toContainEqual({
      field: 'postRegistrationSteps.url',
      message: 'Enter a valid URL.',
    })
  })
})
