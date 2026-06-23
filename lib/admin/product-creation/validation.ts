import type {
  ProductCreationReadiness,
  ProductCreationValidationIssue,
  ProductCreationWizardInput,
  ProductPostRegistrationStepInput,
} from './types'

function isBlank(value: string | null | undefined) {
  return !value || value.trim().length === 0
}

function isValidHttpUrl(value: string | null | undefined) {
  if (isBlank(value)) return false

  try {
    const url = new URL(value!)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function validatePostRegistrationStep(
  step: ProductPostRegistrationStepInput,
  index?: number
): ProductCreationValidationIssue[] {
  const issues: ProductCreationValidationIssue[] = []

  if (!step.isActive) return issues

  const prefix =
    index == null ? 'postRegistrationSteps' : `postRegistrationSteps.${index}`

  if (isBlank(step.title)) {
    issues.push({
      field: `${prefix}.title`,
      message: 'Enter a step title.',
    })
  }

  if (step.type !== 'text' && !isValidHttpUrl(step.url)) {
    issues.push({
      field: `${prefix}.url`,
      message: 'Enter a valid URL.',
    })
  }

  return issues
}

export function getProductCreationReadiness(
  input: ProductCreationWizardInput
): ProductCreationReadiness {
  const issues: ProductCreationValidationIssue[] = []

  if (input.course.sourceMode === 'existing' && !input.course.existingCourseId) {
    issues.push({
      field: 'course.existingCourseId',
      message: 'Select a course.',
    })
  }

  if (isBlank(input.course.title)) {
    issues.push({
      field: 'course.title',
      message: 'Enter a course title.',
    })
  }

  if (input.pricing.mode === 'paid') {
    if (!input.pricing.price || input.pricing.price <= 0) {
      issues.push({
        field: 'pricing.price',
        message: 'Enter a price greater than 0.',
      })
    }

    if (!input.pricing.currency) {
      issues.push({
        field: 'pricing.currency',
        message: 'Select a currency.',
      })
    }

    if (!input.pricing.paymentProvider) {
      issues.push({
        field: 'pricing.paymentProvider',
        message: 'Select a payment method.',
      })
    }
  }

  input.postRegistrationSteps.forEach((step, index) => {
    issues.push(...validatePostRegistrationStep(step, index))
  })

  const draftBlockingFields = new Set(['course.title', 'course.existingCourseId'])
  const draftIssues = issues.filter((issue) => draftBlockingFields.has(issue.field))

  return {
    canSaveDraft: draftIssues.length === 0,
    canPublish: issues.length === 0,
    issues,
  }
}

/**
 * Which validation fields belong to each wizard step, so the UI can gate
 * forward navigation and surface blockers on the step that created them.
 * `review` (the last step) intentionally owns nothing — it shows the full list.
 */
export const wizardStepFieldPrefixes: Record<string, string[]> = {
  source: ['course.existingCourseId'],
  basics: ['course.title'],
  pricing: ['pricing.'],
  'post-registration': ['postRegistrationSteps'],
  review: [],
}

/**
 * Blocking issues for a single wizard step (by its field prefixes).
 */
export function getStepIssues(
  issues: ProductCreationValidationIssue[],
  stepId: string
): ProductCreationValidationIssue[] {
  const prefixes = wizardStepFieldPrefixes[stepId] ?? []
  if (prefixes.length === 0) return []
  return issues.filter((issue) =>
    prefixes.some((prefix) => issue.field === prefix || issue.field.startsWith(prefix))
  )
}
