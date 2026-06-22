import type { PaymentProvider } from '@/lib/payments'

export const postRegistrationStepTypes = [
  'whatsapp',
  'telegram',
  'discord',
  'link',
  'text',
] as const

export type PostRegistrationStepType = (typeof postRegistrationStepTypes)[number]

export type ProductCreationMode = 'create' | 'edit'
export type CourseSourceMode = 'new' | 'existing'
export type PricingMode = 'free' | 'paid'
export type SaveIntent = 'draft' | 'publish'
export type ProductCreationPaymentProvider = Extract<PaymentProvider, 'manual' | 'stripe' | 'paypal'>
export type ProductCreationCurrency = 'usd' | 'eur'

export interface ProductCreationCourseInput {
  sourceMode: CourseSourceMode
  existingCourseId?: number
  title: string
  description?: string | null
  thumbnailUrl?: string | null
  categoryId?: number | null
}

export interface ProductCreationPricingInput {
  mode: PricingMode
  price?: number
  currency?: ProductCreationCurrency
  paymentProvider?: ProductCreationPaymentProvider
}

export interface ProductPostRegistrationStepInput {
  id?: number
  type: PostRegistrationStepType
  title: string
  description?: string | null
  url?: string | null
  sortOrder: number
  isActive: boolean
}

export interface ProductCreationWizardInput {
  intent: SaveIntent
  productId?: number
  course: ProductCreationCourseInput
  pricing: ProductCreationPricingInput
  postRegistrationSteps: ProductPostRegistrationStepInput[]
}

export interface ProductCreationWizardResult {
  courseId: number
  productId: number | null
  pricingMode: PricingMode
  published: boolean
}

export interface ProductCreationValidationIssue {
  field: string
  message: string
}

export interface ProductCreationReadiness {
  canSaveDraft: boolean
  canPublish: boolean
  issues: ProductCreationValidationIssue[]
}
