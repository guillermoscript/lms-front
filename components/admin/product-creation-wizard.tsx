'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCircle,
  IconInfoCircle,
} from '@tabler/icons-react'
import { saveProductCreationWizard } from '@/app/actions/admin/products'
import { ProductPostRegistrationEditor } from '@/components/admin/product-post-registration-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  getProductCreationReadiness,
  getStepIssues,
} from '@/lib/admin/product-creation/validation'
import type {
  CourseSourceMode,
  PricingMode,
  ProductCreationCurrency,
  ProductCreationPaymentProvider,
  ProductCreationPricingInput,
  ProductCreationValidationIssue,
  ProductCreationWizardInput,
  ProductPostRegistrationStepInput,
  SaveIntent,
} from '@/lib/admin/product-creation/types'

interface CourseOption {
  course_id: number
  title: string
  description?: string | null
  thumbnail_url?: string | null
  category_id?: number | null
  status?: string | null
}

interface CategoryOption {
  id: number
  name: string
}

interface ProductCreationWizardProps {
  mode: 'create' | 'edit'
  categories?: CategoryOption[]
  courses: CourseOption[]
  initialInput?: ProductCreationWizardInput
  /** Provider slugs the tenant has enabled in Settings → Payments. Manual is always available. */
  enabledProviders?: string[]
  stripeConnected?: boolean
  className?: string
}

const wizardSteps = [
  {
    id: 'source',
    title: 'Course',
    description: 'Choose whether this offering starts from a new or existing course.',
  },
  {
    id: 'basics',
    title: 'Basics',
    description: 'Set the course details students and admins will recognize.',
  },
  {
    id: 'pricing',
    title: 'Pricing',
    description: 'Create a free course or configure a paid product.',
  },
  {
    id: 'post-registration',
    title: 'After purchase',
    description: 'Add paid-only instructions students see after checkout.',
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Check readiness and choose draft or publish.',
  },
] as const

const defaultInput: ProductCreationWizardInput = {
  intent: 'draft',
  course: {
    sourceMode: 'new',
    title: '',
    description: '',
    thumbnailUrl: '',
    categoryId: null,
  },
  pricing: {
    mode: 'free',
  },
  postRegistrationSteps: [],
}

function getFieldIssue(issues: ProductCreationValidationIssue[], field: string) {
  return issues.find((issue) => issue.field === field)?.message
}

function mergeInput(initialInput?: ProductCreationWizardInput): ProductCreationWizardInput {
  if (!initialInput) {
    return defaultInput
  }

  return {
    ...defaultInput,
    ...initialInput,
    course: {
      ...defaultInput.course,
      ...initialInput.course,
    },
    pricing: {
      ...defaultInput.pricing,
      ...initialInput.pricing,
    },
    postRegistrationSteps: initialInput.postRegistrationSteps || [],
  }
}

function formatPrice(input: ProductCreationWizardInput) {
  if (input.pricing.mode === 'free') {
    return 'Free'
  }

  const amount = input.pricing.price || 0
  const currency = (input.pricing.currency || 'usd').toUpperCase()
  return `${currency} ${amount.toFixed(2)}`
}

export function ProductCreationWizard({
  mode,
  categories = [],
  courses,
  initialInput,
  enabledProviders = [],
  stripeConnected = false,
  className,
}: ProductCreationWizardProps) {
  const router = useRouter()
  const tProductForm = useTranslations('dashboard.admin.products.form')
  const [currentStep, setCurrentStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Steps the user has tried to leave (or submit from). Inline errors only show
  // once a step is "attempted", so blank required fields aren't flagged before
  // the user has had a chance to fill them.
  const [attempted, setAttempted] = useState<Set<number>>(() => new Set())
  const [input, setInput] = useState<ProductCreationWizardInput>(() => mergeInput(initialInput))

  const readiness = useMemo(() => getProductCreationReadiness(input), [input])
  // Manual is always sellable; Stripe/PayPal only when the tenant enabled them
  // in Settings → Payments. Keep the current value visible in edit mode even if
  // its provider has since been disabled, so the admin can see (and change) it.
  const availableProviders = useMemo(() => {
    const providers: ProductCreationPaymentProvider[] = ['manual']
    for (const candidate of ['stripe', 'paypal'] as const) {
      if (
        enabledProviders.includes(candidate) ||
        input.pricing.paymentProvider === candidate
      ) {
        providers.push(candidate)
      }
    }
    return providers
  }, [enabledProviders, input.pricing.paymentProvider])
  const stepProgress = ((currentStep + 1) / wizardSteps.length) * 100
  const selectedCourse = courses.find(
    (course) => course.course_id === input.course.existingCourseId
  )

  function stepHasIssues(index: number) {
    return getStepIssues(readiness.issues, wizardSteps[index].id).length > 0
  }

  function markAttempted(...indexes: number[]) {
    setAttempted((prev) => {
      const next = new Set(prev)
      indexes.forEach((index) => next.add(index))
      return next
    })
  }

  // Free backward navigation; forward navigation is gated on every prior step
  // being valid, landing the user on the first one that still has blockers.
  function goToStep(target: number) {
    setSubmitError(null)
    if (target <= currentStep) {
      setCurrentStep(target)
      return
    }

    for (let index = 0; index < target; index += 1) {
      if (stepHasIssues(index)) {
        markAttempted(...Array.from({ length: index + 1 }, (_, i) => i))
        setCurrentStep(index)
        return
      }
    }

    setCurrentStep(target)
  }

  // Returns a field's error only once its step has been attempted, so required
  // fields don't show errors before the user interacts with them.
  function fieldError(field: string, stepIndex: number) {
    if (!attempted.has(stepIndex)) return undefined
    return getFieldIssue(readiness.issues, field)
  }

  function setSourceMode(sourceMode: CourseSourceMode) {
    setInput((current) => ({
      ...current,
      course: {
        ...current.course,
        sourceMode,
        existingCourseId:
          sourceMode === 'existing' ? current.course.existingCourseId : undefined,
      },
    }))
  }

  function selectExistingCourse(courseId: string | null) {
    if (!courseId) {
      return
    }

    const course = courses.find((item) => item.course_id === Number(courseId))
    setInput((current) => ({
      ...current,
      course: {
        ...current.course,
        sourceMode: 'existing',
        existingCourseId: Number(courseId),
        title: course?.title || current.course.title,
        description: course?.description || '',
        thumbnailUrl: course?.thumbnail_url || '',
        categoryId: course?.category_id || null,
      },
    }))
  }

  function setPricingMode(mode: PricingMode) {
    setInput((current) => ({
      ...current,
      pricing:
        mode === 'free'
          ? { mode: 'free' }
          : {
              mode: 'paid',
              price: current.pricing.price || 0,
              currency: current.pricing.currency || 'usd',
              paymentProvider: current.pricing.paymentProvider || 'manual',
            },
      postRegistrationSteps: mode === 'free' ? [] : current.postRegistrationSteps,
    }))
  }

  function updateCourse(patch: Partial<ProductCreationWizardInput['course']>) {
    setInput((current) => ({
      ...current,
      course: {
        ...current.course,
        ...patch,
      },
    }))
  }

  function updatePaidPricing(patch: Partial<ProductCreationPricingInput>) {
    setInput((current) => ({
      ...current,
      pricing: {
        mode: 'paid',
        price: current.pricing.price || 0,
        currency: current.pricing.currency || 'usd',
        paymentProvider: current.pricing.paymentProvider || 'manual',
        ...patch,
      },
    }))
  }

  async function submit(intent: SaveIntent) {
    const payload: ProductCreationWizardInput = { ...input, intent }
    const localReadiness = getProductCreationReadiness(payload)

    if (intent === 'draft' && !localReadiness.canSaveDraft) {
      markAttempted(0, 1, 2, 3, 4)
      setSubmitError(localReadiness.issues[0]?.message || 'Add a title before saving.')
      setCurrentStep(0)
      return
    }

    if (intent === 'publish' && !localReadiness.canPublish) {
      markAttempted(0, 1, 2, 3, 4)
      // Land on the first step that still has blockers.
      const firstInvalid = wizardSteps.findIndex((_, index) => stepHasIssues(index))
      setSubmitError(localReadiness.issues[0]?.message || 'Complete required setup first.')
      setCurrentStep(firstInvalid === -1 ? 4 : firstInvalid)
      return
    }

    setIsSaving(true)
    setSubmitError(null)

    try {
      const result = await saveProductCreationWizard(payload)

      if (!result.success) {
        const message = result.error || 'Could not save this offering.'
        setSubmitError(message)
        toast.error(message)
        return
      }

      toast.success(intent === 'publish' ? 'Offering published.' : 'Draft saved.')
      router.push('/dashboard/admin/products')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this offering.'
      setSubmitError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      data-testid="product-creation-wizard"
      className={cn('grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]', className)}
    >
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium">
            Step {currentStep + 1} of {wizardSteps.length}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {wizardSteps[currentStep].title}
          </span>
        </div>
        <Progress value={stepProgress} />
      </div>

      <nav aria-label="Product creation steps" className="hidden lg:block">
        <ol className="flex flex-col gap-1">
          {wizardSteps.map((step, index) => {
            const isCurrent = index === currentStep
            const isComplete = index < currentStep

            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => goToStep(index)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isCurrent
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium transition-colors',
                      isComplete && 'border-primary bg-primary text-primary-foreground',
                      isCurrent && !isComplete && 'border-primary text-primary',
                      !isCurrent && !isComplete && 'border-border'
                    )}
                  >
                    {isComplete ? <IconCheck /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{step.title}</span>
                    <span className="mt-0.5 block text-xs/relaxed text-muted-foreground">
                      {step.description}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="flex min-w-0 flex-col gap-5 rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{wizardSteps[currentStep].title}</h2>
            <Badge variant="secondary">{mode === 'edit' ? 'Edit mode' : 'New offering'}</Badge>
          </div>
          <p className="text-xs/relaxed text-muted-foreground">
            {wizardSteps[currentStep].description}
          </p>
        </div>

        <Separator />

        {currentStep === 0 && (
          <FieldSet>
            <FieldLegend>Course source</FieldLegend>
            <RadioGroup
              value={input.course.sourceMode}
              onValueChange={(value) => setSourceMode(value as CourseSourceMode)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <FieldLabel data-testid="course-source-new" className="rounded-lg border p-3">
                <Field orientation="horizontal">
                  <RadioGroupItem value="new" disabled={isSaving} />
                  <FieldContent>
                    <span className="text-sm font-medium">Create new course</span>
                    <FieldDescription>
                      Create a course shell and optionally attach paid pricing.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>

              <FieldLabel data-testid="course-source-existing" className="rounded-lg border p-3">
                <Field orientation="horizontal">
                  <RadioGroupItem value="existing" disabled={isSaving} />
                  <FieldContent>
                    <span className="text-sm font-medium">Use existing course</span>
                    <FieldDescription>
                      Reuse a tenant course, including drafts being prepared for launch.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            </RadioGroup>

            {input.course.sourceMode === 'existing' && (
              <Field data-invalid={Boolean(fieldError('course.existingCourseId', 0))}>
                <FieldLabel htmlFor="existing-course">Course</FieldLabel>
                <Select
                  value={input.course.existingCourseId?.toString()}
                  disabled={isSaving}
                  onValueChange={selectExistingCourse}
                >
                  <SelectTrigger
                    id="existing-course"
                    data-testid="existing-course-select"
                    className="w-full"
                  >
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {courses.map((course) => (
                        <SelectItem key={course.course_id} value={course.course_id.toString()}>
                          {course.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {selectedCourse?.status && (
                  <FieldDescription>Selected course status: {selectedCourse.status}</FieldDescription>
                )}
                <FieldError>{fieldError('course.existingCourseId', 0)}</FieldError>
              </Field>
            )}
          </FieldSet>
        )}

        {currentStep === 1 && (
          <FieldGroup>
            <Field data-invalid={Boolean(fieldError('course.title', 1))}>
              <FieldLabel htmlFor="offering-title">Title</FieldLabel>
              <Input
                id="offering-title"
                data-testid="product-creation-title"
                value={input.course.title}
                disabled={isSaving}
                aria-invalid={Boolean(fieldError('course.title', 1))}
                placeholder="e.g., Product Strategy Intensive"
                onChange={(event) => updateCourse({ title: event.target.value })}
              />
              <FieldError>{fieldError('course.title', 1)}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="offering-description">
                {tProductForm('description')}
              </FieldLabel>
              <Textarea
                id="offering-description"
                data-testid="product-creation-description"
                value={input.course.description || ''}
                disabled={isSaving}
                rows={5}
                placeholder="Summarize the outcome, audience, and what the course includes."
                onChange={(event) => updateCourse({ description: event.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="offering-category">Category</FieldLabel>
                <Select
                  value={input.course.categoryId?.toString()}
                  disabled={isSaving || categories.length === 0}
                  onValueChange={(value) => updateCourse({ categoryId: Number(value) })}
                >
                  <SelectTrigger id="offering-category" className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {categories.length === 0 && (
                  <FieldDescription>No categories are available yet.</FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="offering-thumbnail">{tProductForm('image')}</FieldLabel>
                <Input
                  id="offering-thumbnail"
                  type="url"
                  value={input.course.thumbnailUrl || ''}
                  disabled={isSaving}
                  placeholder={tProductForm('imagePlaceholder')}
                  onChange={(event) => updateCourse({ thumbnailUrl: event.target.value })}
                />
              </Field>
            </div>
          </FieldGroup>
        )}

        {currentStep === 2 && (
          <FieldSet>
            <FieldLegend>Pricing mode</FieldLegend>
            <RadioGroup
              value={input.pricing.mode}
              onValueChange={(value) => setPricingMode(value as PricingMode)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <FieldLabel data-testid="pricing-mode-free" className="rounded-lg border p-3">
                <Field orientation="horizontal">
                  <RadioGroupItem value="free" disabled={isSaving} />
                  <FieldContent>
                    <span className="text-sm font-medium">Free</span>
                    <FieldDescription>Publish the course without creating a product row.</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>

              <FieldLabel data-testid="pricing-mode-paid" className="rounded-lg border p-3">
                <Field orientation="horizontal">
                  <RadioGroupItem value="paid" disabled={isSaving} />
                  <FieldContent>
                    <span className="text-sm font-medium">Paid</span>
                    <FieldDescription>Create a product and link it to this course.</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            </RadioGroup>

            {input.pricing.mode === 'paid' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={Boolean(fieldError('pricing.price', 2))}>
                  <FieldLabel htmlFor="offering-price">{tProductForm('price')}</FieldLabel>
                  <Input
                    id="offering-price"
                    data-testid="product-creation-price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={input.pricing.price || ''}
                    disabled={isSaving}
                    aria-invalid={Boolean(fieldError('pricing.price', 2))}
                    onChange={(event) =>
                      updatePaidPricing({ price: Number(event.target.value) })
                    }
                  />
                  <FieldError>{fieldError('pricing.price', 2)}</FieldError>
                </Field>

                <Field data-invalid={Boolean(fieldError('pricing.currency', 2))}>
                  <FieldLabel htmlFor="offering-currency">{tProductForm('currency')}</FieldLabel>
                  <Select
                    value={input.pricing.currency || 'usd'}
                    disabled={isSaving}
                    onValueChange={(value) =>
                      updatePaidPricing({ currency: value as ProductCreationCurrency })
                    }
                  >
                    <SelectTrigger
                      id="offering-currency"
                      data-testid="product-creation-currency"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="usd">{tProductForm('currencyUsd')}</SelectItem>
                        <SelectItem value="eur">{tProductForm('currencyEur')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldError('pricing.currency', 2)}</FieldError>
                </Field>

                <Field data-invalid={Boolean(fieldError('pricing.paymentProvider', 2))}>
                  <FieldLabel htmlFor="offering-payment-provider">
                    {tProductForm('method')}
                  </FieldLabel>
                  <Select
                    value={input.pricing.paymentProvider || 'manual'}
                    disabled={isSaving}
                    onValueChange={(value) =>
                      updatePaidPricing({
                        paymentProvider: value as ProductCreationPaymentProvider,
                      })
                    }
                  >
                    <SelectTrigger
                      id="offering-payment-provider"
                      data-testid="product-creation-payment-provider"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {availableProviders.includes('manual') && (
                          <SelectItem value="manual">{tProductForm('methodManual')}</SelectItem>
                        )}
                        {availableProviders.includes('stripe') && (
                          <SelectItem value="stripe">{tProductForm('methodStripe')}</SelectItem>
                        )}
                        {availableProviders.includes('paypal') && (
                          <SelectItem value="paypal">{tProductForm('methodPaypal')}</SelectItem>
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldError('pricing.paymentProvider', 2)}</FieldError>
                </Field>

                {/* Non-blocking Connect nudge: manual selling always works, but cards need Stripe (#438) */}
                {!stripeConnected && (
                  <Alert>
                    <IconInfoCircle />
                    <AlertDescription>
                      {tProductForm('connectNudge')}{' '}
                      <Link
                        href="/dashboard/admin/settings?tab=payment"
                        className="font-medium underline underline-offset-2"
                      >
                        {tProductForm('connectNudgeLink')}
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </FieldSet>
        )}

        {currentStep === 3 && (
          <div className="flex flex-col gap-4">
            {input.pricing.mode === 'free' ? (
              <Alert>
                <IconInfoCircle />
                <AlertDescription>
                  Post-registration instructions are product-scoped, so they are available for
                  paid offerings only in this version.
                </AlertDescription>
              </Alert>
            ) : (
              <ProductPostRegistrationEditor
                disabled={isSaving}
                steps={input.postRegistrationSteps}
                issues={attempted.has(3) ? readiness.issues : []}
                onChange={(postRegistrationSteps: ProductPostRegistrationStepInput[]) =>
                  setInput((current) => ({ ...current, postRegistrationSteps }))
                }
              />
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div className="flex flex-col gap-5">
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">Course</dt>
                <dd className="mt-1 truncate text-sm font-medium">
                  {input.course.title || 'Untitled course'}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  {input.course.sourceMode === 'new' ? 'New course' : 'Existing course'}
                </dd>
              </div>
              <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">Pricing</dt>
                <dd className="mt-1 text-sm font-medium">{formatPrice(input)}</dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  {input.pricing.mode === 'paid'
                    ? input.pricing.paymentProvider || 'No provider'
                    : 'No product created'}
                </dd>
              </div>
              <div className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">After purchase</dt>
                <dd className="mt-1 text-sm font-medium">
                  {input.pricing.mode === 'paid'
                    ? `${input.postRegistrationSteps.length} step${
                        input.postRegistrationSteps.length === 1 ? '' : 's'
                      }`
                    : 'Not applicable'}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  {input.pricing.mode === 'paid' ? 'Optional instructions' : 'Free course'}
                </dd>
              </div>
            </dl>

            <div className="divide-y overflow-hidden rounded-lg border">
              <ReadinessRow checked={readiness.canSaveDraft} label="Draft can be saved" />
              <ReadinessRow checked={readiness.canPublish} label="Ready to publish" />
              {readiness.issues.map((issue, index) => (
                <div
                  key={`${issue.field}-${index}`}
                  className="flex items-start gap-2 px-3 py-2 text-xs/relaxed text-destructive"
                >
                  <IconCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {submitError && (
          <Alert variant="destructive">
            <IconInfoCircle />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={currentStep === 0 || isSaving}
              onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
            >
              <IconChevronLeft data-icon="inline-start" />
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="product-creation-next"
              disabled={currentStep === wizardSteps.length - 1 || isSaving}
              onClick={() => goToStep(currentStep + 1)}
            >
              Next
              <IconChevronRight data-icon="inline-end" />
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              data-testid="product-creation-save-draft"
              variant="outline"
              disabled={isSaving || !readiness.canSaveDraft}
              onClick={() => submit('draft')}
            >
              {isSaving ? tProductForm('saving') : 'Save draft'}
            </Button>
            <Button
              type="button"
              data-testid="product-creation-publish"
              disabled={isSaving || !readiness.canPublish}
              onClick={() => submit('publish')}
            >
              {isSaving ? tProductForm('saving') : 'Publish'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReadinessRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs/relaxed">
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-muted-foreground'
        )}
      >
        {checked ? <IconCheck className="size-3" /> : <IconCircle className="size-3" />}
      </span>
      <span className={cn(!checked && 'text-muted-foreground')}>{label}</span>
    </div>
  )
}
