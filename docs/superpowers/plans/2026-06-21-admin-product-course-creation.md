# Admin Product/Course Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace admin product creation with a guided admin-only flow that can create or attach a course, configure free or paid pricing, add paid post-registration instructions, and publish only when setup is ready.

**Architecture:** Keep server pages responsible for tenant-scoped data loading and use a focused client wizard for step state and local validation. Add a small validation module shared by the wizard and server action, a new tenant-scoped `product_post_registration_steps` table, and one admin server action that atomically persists course/product/link/steps.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL/RLS, Shadcn UI, next-intl, Vitest, Playwright.

---

## Files

- Create: `lib/admin/product-creation/types.ts`
  - Shared wizard input/result types and post-registration step enums.
- Create: `lib/admin/product-creation/validation.ts`
  - Pure validation/readiness helpers for unit tests, client validation, and server action validation.
- Create: `tests/unit/product-creation-validation.test.ts`
  - Unit coverage for readiness, pricing, post-registration URL validation, and product requirement rules.
- Create: `supabase/migrations/20260621120000_create_product_post_registration_steps.sql`
  - New tenant-scoped post-registration table and RLS policies.
- Create: `components/admin/product-creation-wizard.tsx`
  - Admin guided create/edit wizard.
- Create: `components/admin/product-post-registration-editor.tsx`
  - Paid post-registration step editor.
- Modify: `app/actions/admin/products.ts`
  - Add `saveProductCreationWizard`, input validation, course/product/link/step persistence, and revalidation.
- Modify: `app/[locale]/dashboard/admin/products/new/page.tsx`
  - Replace `ProductForm` with wizard create mode.
- Modify: `app/[locale]/dashboard/admin/products/[productId]/edit/page.tsx`
  - Replace `ProductForm` with wizard edit mode and load post-registration steps.
- Modify: `messages/en.json`
  - Add wizard copy.
- Modify: `messages/es.json`
  - Add Spanish wizard copy.
- Modify: `tests/admin/products-manual-payment.spec.ts`
  - Update product creation UI expectations to wizard flow.
- Create: `tests/playwright/admin-product-course-creation.spec.ts`
  - Smoke tests for new free course, new paid offering, existing course paid offering.

## Task 1: Shared Types

**Files:**
- Create: `lib/admin/product-creation/types.ts`

- [ ] **Step 1: Create type file**

Add:

```ts
export const postRegistrationStepTypes = [
  'whatsapp',
  'telegram',
  'discord',
  'link',
  'text',
] as const

export type PostRegistrationStepType = typeof postRegistrationStepTypes[number]

export type ProductCreationMode = 'create' | 'edit'
export type CourseSourceMode = 'new' | 'existing'
export type PricingMode = 'free' | 'paid'
export type SaveIntent = 'draft' | 'publish'
export type ProductCreationPaymentProvider = 'manual' | 'stripe' | 'paypal'
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
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS or existing unrelated errors. If errors mention this file, fix exported names before continuing.

- [ ] **Step 3: Commit**

```bash
git add lib/admin/product-creation/types.ts
git commit -m "feat: add product creation wizard types"
```

## Task 2: Validation Helpers

**Files:**
- Create: `lib/admin/product-creation/validation.ts`
- Create: `tests/unit/product-creation-validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add `tests/unit/product-creation-validation.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test:unit -- tests/unit/product-creation-validation.test.ts`

Expected: FAIL with module not found for `@/lib/admin/product-creation/validation`.

- [ ] **Step 3: Implement validation helpers**

Create `lib/admin/product-creation/validation.ts`:

```ts
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
  step: ProductPostRegistrationStepInput
): ProductCreationValidationIssue[] {
  const issues: ProductCreationValidationIssue[] = []

  if (!step.isActive) return issues

  if (isBlank(step.title)) {
    issues.push({
      field: 'postRegistrationSteps.title',
      message: 'Enter a step title.',
    })
  }

  if (step.type !== 'text' && !isValidHttpUrl(step.url)) {
    issues.push({
      field: 'postRegistrationSteps.url',
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

  for (const step of input.postRegistrationSteps) {
    issues.push(...validatePostRegistrationStep(step))
  }

  const draftBlockingFields = new Set(['course.title', 'course.existingCourseId'])
  const draftIssues = issues.filter((issue) => draftBlockingFields.has(issue.field))

  return {
    canSaveDraft: draftIssues.length === 0,
    canPublish: issues.length === 0,
    issues,
  }
}
```

- [ ] **Step 4: Run unit test to verify pass**

Run: `npm run test:unit -- tests/unit/product-creation-validation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/product-creation/validation.ts tests/unit/product-creation-validation.test.ts
git commit -m "test: add product creation validation"
```

## Task 3: Database Migration

**Files:**
- Create: `supabase/migrations/20260621120000_create_product_post_registration_steps.sql`

- [ ] **Step 1: Create migration**

Add:

```sql
create table if not exists public.product_post_registration_steps (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id integer not null references public.products(product_id) on delete cascade,
  type text not null check (type in ('whatsapp', 'telegram', 'discord', 'link', 'text')),
  title text not null,
  description text,
  url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_post_registration_steps_tenant_product_order
  on public.product_post_registration_steps (tenant_id, product_id, sort_order);

create index if not exists idx_product_post_registration_steps_product
  on public.product_post_registration_steps (product_id);

alter table public.product_post_registration_steps enable row level security;

create policy "Tenant admins manage post registration steps"
  on public.product_post_registration_steps
  for all
  using (
    exists (
      select 1
      from public.tenant_users tu
      where tu.tenant_id = product_post_registration_steps.tenant_id
        and tu.user_id = auth.uid()
        and tu.role = 'admin'
        and tu.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_users tu
      where tu.tenant_id = product_post_registration_steps.tenant_id
        and tu.user_id = auth.uid()
        and tu.role = 'admin'
        and tu.status = 'active'
    )
  );
```

- [ ] **Step 2: Verify migration syntax locally**

Run: `supabase db reset`

Expected: PASS. If Supabase CLI or Docker is unavailable, record exact failure and continue with code-level tests.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260621120000_create_product_post_registration_steps.sql
git commit -m "feat: add product post-registration steps table"
```

## Task 4: Server Action

**Files:**
- Modify: `app/actions/admin/products.ts`

- [ ] **Step 1: Add imports**

At top of `app/actions/admin/products.ts`, add:

```ts
import { getProductCreationReadiness } from '@/lib/admin/product-creation/validation'
import type {
  ProductCreationWizardInput,
  ProductCreationWizardResult,
  ProductPostRegistrationStepInput,
} from '@/lib/admin/product-creation/types'
```

- [ ] **Step 2: Add helper to normalize post-registration rows**

Below existing interfaces, add:

```ts
function normalizePostRegistrationSteps(
  tenantId: string,
  productId: number,
  steps: ProductPostRegistrationStepInput[]
) {
  return steps
    .filter((step) => step.isActive)
    .map((step, index) => ({
      tenant_id: tenantId,
      product_id: productId,
      type: step.type,
      title: step.title.trim(),
      description: step.description?.trim() || null,
      url: step.type === 'text' ? null : step.url?.trim() || null,
      sort_order: index,
      is_active: true,
    }))
}
```

- [ ] **Step 3: Add server action shell**

Append before `archiveProduct`:

```ts
export async function saveProductCreationWizard(
  input: ProductCreationWizardInput
): Promise<ActionResult<ProductCreationWizardResult>> {
  try {
    await verifyAdminAccess()

    const readiness = getProductCreationReadiness(input)
    if (input.intent === 'publish' && !readiness.canPublish) {
      throw new Error(readiness.issues[0]?.message || 'Offering is not ready to publish')
    }
    if (input.intent === 'draft' && !readiness.canSaveDraft) {
      throw new Error(readiness.issues[0]?.message || 'Offering is not ready to save')
    }

    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    let courseId = input.course.existingCourseId ?? null

    if (input.course.sourceMode === 'existing') {
      const { data: existingCourse, error: courseError } = await adminClient
        .from('courses')
        .select('course_id, tenant_id')
        .eq('course_id', input.course.existingCourseId!)
        .eq('tenant_id', tenantId)
        .single()

      if (courseError || !existingCourse) {
        throw new Error('Course not found or access denied')
      }
    } else {
      const limitCheck = await import('@/app/actions/teacher/courses').then((mod) => mod.checkCourseLimit())
      if (!limitCheck.canCreate) {
        throw new Error(
          `Your ${limitCheck.plan} plan is limited to ${limitCheck.limit} courses. You currently have ${limitCheck.currentCount} courses.`
        )
      }

      const { data: { user } } = await adminClient.auth.admin.getUserById((await import('@/lib/supabase/tenant')).getCurrentUserId ? '' : '')
      void user
    }

    return {
      success: false,
      error: 'Save action body is added in the next step before running checks.',
    }
  } catch (error) {
    console.error('Save product creation wizard failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save offering',
    }
  }
}
```

- [ ] **Step 4: Replace action shell body with real implementation**

Replace everything from `let courseId = input.course.existingCourseId ?? null` through the early return with:

```ts
    let courseId = input.course.existingCourseId ?? null

    if (input.course.sourceMode === 'existing') {
      const { data: existingCourse, error: courseError } = await adminClient
        .from('courses')
        .select('course_id, tenant_id')
        .eq('course_id', input.course.existingCourseId!)
        .eq('tenant_id', tenantId)
        .single()

      if (courseError || !existingCourse) {
        throw new Error('Course not found or access denied')
      }

      const { error: updateCourseError } = await adminClient
        .from('courses')
        .update({
          title: input.course.title.trim(),
          description: input.course.description?.trim() || null,
          thumbnail_url: input.course.thumbnailUrl?.trim() || null,
          category_id: input.course.categoryId || null,
          status: input.intent === 'publish' ? 'published' : undefined,
        })
        .eq('course_id', courseId!)
        .eq('tenant_id', tenantId)

      if (updateCourseError) throw updateCourseError
    } else {
      const limitCheck = await import('@/app/actions/teacher/courses').then((mod) => mod.checkCourseLimit())
      if (!limitCheck.canCreate) {
        throw new Error(
          `Your ${limitCheck.plan} plan is limited to ${limitCheck.limit} courses. You currently have ${limitCheck.currentCount} courses.`
        )
      }

      const currentUserId = await import('@/lib/supabase/tenant').then((mod) => mod.getCurrentUserId())
      if (!currentUserId) {
        throw new Error('Not authenticated')
      }

      await adminClient
        .from('profiles')
        .upsert({ id: currentUserId }, { onConflict: 'id', ignoreDuplicates: true })

      const { data: course, error: createCourseError } = await adminClient
        .from('courses')
        .insert({
          tenant_id: tenantId,
          author_id: currentUserId,
          title: input.course.title.trim(),
          description: input.course.description?.trim() || null,
          thumbnail_url: input.course.thumbnailUrl?.trim() || null,
          category_id: input.course.categoryId || null,
          status: input.intent === 'publish' ? 'published' : 'draft',
        })
        .select('course_id')
        .single()

      if (createCourseError) throw createCourseError
      courseId = course.course_id
    }

    let productId = input.productId ?? null

    if (input.pricing.mode === 'free') {
      if (productId) {
        await archiveProduct(productId)
      }
      revalidatePath('/dashboard/admin/products')
      revalidatePath('/dashboard/admin/monetization')
      revalidatePath('/dashboard/teacher/courses')
      revalidatePath('/courses')
      revalidatePath('/products')

      return {
        success: true,
        data: {
          courseId: courseId!,
          productId: null,
          pricingMode: 'free',
          published: input.intent === 'publish',
        },
      }
    }

    const provider = getPaymentProvider(input.pricing.paymentProvider || 'manual')

    if (productId) {
      const { data: existingProduct, error: productFetchError } = await adminClient
        .from('products')
        .select('*')
        .eq('product_id', productId)
        .eq('tenant_id', tenantId)
        .single()

      if (productFetchError || !existingProduct) {
        throw new Error('Product not found or access denied')
      }

      const { error: updateProductError } = await adminClient
        .from('products')
        .update({
          name: input.course.title.trim(),
          description: input.course.description?.trim() || null,
          price: input.pricing.price!,
          currency: input.pricing.currency!,
          image: input.course.thumbnailUrl?.trim() || null,
          payment_provider: provider.provider,
          status: input.intent === 'publish' ? 'active' : 'inactive',
        })
        .eq('product_id', productId)
        .eq('tenant_id', tenantId)

      if (updateProductError) throw updateProductError
    } else {
      const paymentProduct = await provider.createProduct({
        name: input.course.title.trim(),
        description: input.course.description?.trim() || '',
        images: input.course.thumbnailUrl ? [input.course.thumbnailUrl] : [],
        metadata: {
          created_by: 'admin_product_creation_wizard',
          created_at: new Date().toISOString(),
        },
      })

      const paymentPrice = await provider.createPrice({
        productId: paymentProduct.id,
        amount: provider.convertAmount(input.pricing.price!, 'major'),
        currency: input.pricing.currency!,
        type: 'one_time',
        metadata: {
          product_name: input.course.title.trim(),
        },
      })

      const { data: product, error: createProductError } = await adminClient
        .from('products')
        .insert({
          tenant_id: tenantId,
          name: input.course.title.trim(),
          description: input.course.description?.trim() || null,
          price: input.pricing.price!,
          currency: input.pricing.currency!,
          image: input.course.thumbnailUrl?.trim() || null,
          payment_provider: provider.provider,
          provider_product_id: paymentProduct.id,
          provider_price_id: paymentPrice.id,
          status: input.intent === 'publish' ? 'active' : 'inactive',
        })
        .select('product_id')
        .single()

      if (createProductError) throw createProductError
      productId = product.product_id
    }

    await adminClient
      .from('product_courses')
      .delete()
      .eq('product_id', productId!)
      .eq('tenant_id', tenantId)

    const { error: linkError } = await adminClient
      .from('product_courses')
      .insert({
        tenant_id: tenantId,
        product_id: productId!,
        course_id: courseId!,
      })

    if (linkError) throw linkError

    await adminClient
      .from('product_post_registration_steps')
      .delete()
      .eq('product_id', productId!)
      .eq('tenant_id', tenantId)

    const stepRows = normalizePostRegistrationSteps(
      tenantId,
      productId!,
      input.postRegistrationSteps
    )

    if (stepRows.length > 0) {
      const { error: stepsError } = await adminClient
        .from('product_post_registration_steps')
        .insert(stepRows)

      if (stepsError) throw stepsError
    }

    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/admin/monetization')
    revalidatePath('/dashboard/teacher/courses')
    revalidatePath('/courses')
    revalidatePath('/products')

    return {
      success: true,
      data: {
        courseId: courseId!,
        productId,
        pricingMode: 'paid',
        published: input.intent === 'publish',
      },
    }
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

Expected: FAIL if `PaymentProvider` union rejects `paypal` or generated Supabase types do not include new table. Fix by narrowing wizard provider type to existing `PaymentProvider` from `@/lib/payments` and by using typed casts for the new table until generated DB types are refreshed.

- [ ] **Step 6: Commit**

```bash
git add app/actions/admin/products.ts
git commit -m "feat: add admin offering save action"
```

## Task 5: Post-Registration Editor

**Files:**
- Create: `components/admin/product-post-registration-editor.tsx`

- [ ] **Step 1: Create editor component**

Add:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  PostRegistrationStepType,
  ProductPostRegistrationStepInput,
} from '@/lib/admin/product-creation/types'
import { IconPlus, IconTrash } from '@tabler/icons-react'

const labels: Record<PostRegistrationStepType, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  link: 'Link',
  text: 'Text',
}

interface ProductPostRegistrationEditorProps {
  steps: ProductPostRegistrationStepInput[]
  onChange: (steps: ProductPostRegistrationStepInput[]) => void
}

export function ProductPostRegistrationEditor({
  steps,
  onChange,
}: ProductPostRegistrationEditorProps) {
  function addStep(type: PostRegistrationStepType) {
    onChange([
      ...steps,
      {
        type,
        title: labels[type],
        description: '',
        url: '',
        sortOrder: steps.length,
        isActive: true,
      },
    ])
  }

  function updateStep(index: number, patch: Partial<ProductPostRegistrationStepInput>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }

  function removeStep(index: number) {
    onChange(
      steps
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, sortOrder: i }))
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(labels).map(([type, label]) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addStep(type as PostRegistrationStepType)}
          >
            <IconPlus className="mr-2 h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Add optional instructions students see after purchase.
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={`${step.type}-${index}`} className="rounded-lg border p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <Select
                  value={step.type}
                  onValueChange={(value) =>
                    updateStep(index, { type: value as PostRegistrationStepType })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(labels).map(([type, label]) => (
                      <SelectItem key={type} value={type}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeStep(index)}
                  aria-label="Remove step"
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={step.title}
                    onChange={(event) => updateStep(index, { title: event.target.value })}
                  />
                </div>
                {step.type !== 'text' && (
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      type="url"
                      value={step.url || ''}
                      placeholder="https://"
                      onChange={(event) => updateStep(index, { url: event.target.value })}
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={step.description || ''}
                  rows={3}
                  onChange={(event) => updateStep(index, { description: event.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS or unrelated errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/product-post-registration-editor.tsx
git commit -m "feat: add post-registration editor"
```

## Task 6: Wizard Component

**Files:**
- Create: `components/admin/product-creation-wizard.tsx`

- [ ] **Step 1: Create wizard component**

Add a first working version:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ProductPostRegistrationEditor } from './product-post-registration-editor'
import { saveProductCreationWizard } from '@/app/actions/admin/products'
import { getProductCreationReadiness } from '@/lib/admin/product-creation/validation'
import type {
  CourseSourceMode,
  PricingMode,
  ProductCreationCurrency,
  ProductCreationPaymentProvider,
  ProductCreationWizardInput,
  ProductPostRegistrationStepInput,
} from '@/lib/admin/product-creation/types'

interface CourseOption {
  course_id: number
  title: string
  description?: string | null
  thumbnail_url?: string | null
  category_id?: number | null
}

interface CategoryOption {
  id: number
  name: string
}

interface ProductCreationWizardProps {
  mode: 'create' | 'edit'
  categories: CategoryOption[]
  courses: CourseOption[]
  initialInput?: ProductCreationWizardInput
}

const steps = ['Course', 'Basics', 'Pricing', 'After purchase', 'Review'] as const

export function ProductCreationWizard({
  categories,
  courses,
  initialInput,
}: ProductCreationWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState<ProductCreationWizardInput>(
    initialInput || {
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
  )

  const readiness = useMemo(() => getProductCreationReadiness(input), [input])

  function setSourceMode(sourceMode: CourseSourceMode) {
    setInput((current) => ({
      ...current,
      course: {
        ...current.course,
        sourceMode,
        existingCourseId: sourceMode === 'new' ? undefined : current.course.existingCourseId,
      },
    }))
  }

  function selectExistingCourse(courseId: string) {
    const selected = courses.find((course) => course.course_id === Number(courseId))
    setInput((current) => ({
      ...current,
      course: {
        ...current.course,
        sourceMode: 'existing',
        existingCourseId: Number(courseId),
        title: selected?.title || current.course.title,
        description: selected?.description || '',
        thumbnailUrl: selected?.thumbnail_url || '',
        categoryId: selected?.category_id || null,
      },
    }))
  }

  function setPricingMode(mode: PricingMode) {
    setInput((current) => ({
      ...current,
      pricing: mode === 'free'
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

  async function submit(intent: 'draft' | 'publish') {
    setLoading(true)
    setError(null)

    const payload = { ...input, intent }
    const localReadiness = getProductCreationReadiness(payload)
    if (intent === 'draft' && !localReadiness.canSaveDraft) {
      setError(localReadiness.issues[0]?.message || 'Cannot save draft')
      setLoading(false)
      return
    }
    if (intent === 'publish' && !localReadiness.canPublish) {
      setError(localReadiness.issues[0]?.message || 'Cannot publish')
      setLoading(false)
      return
    }

    const result = await saveProductCreationWizard(payload)
    if (!result.success) {
      setError(result.error || 'Failed to save offering')
      toast.error(result.error || 'Failed to save offering')
      setLoading(false)
      return
    }

    toast.success(intent === 'publish' ? 'Offering published' : 'Draft saved')
    router.push('/dashboard/admin/products')
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {steps.map((step, index) => (
          <button
            key={step}
            type="button"
            onClick={() => setCurrentStep(index)}
            className={`rounded-md px-3 py-2 text-left text-sm ${
              currentStep === index ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            {index + 1}. {step}
          </button>
        ))}
      </nav>

      <div className="space-y-6 rounded-lg border p-5">
        {currentStep === 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">What are you creating?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant={input.course.sourceMode === 'new' ? 'default' : 'outline'}
                onClick={() => setSourceMode('new')}
              >
                Create new course
              </Button>
              <Button
                type="button"
                variant={input.course.sourceMode === 'existing' ? 'default' : 'outline'}
                onClick={() => setSourceMode('existing')}
              >
                Use existing course
              </Button>
            </div>
            {input.course.sourceMode === 'existing' && (
              <div className="space-y-2">
                <Label>Course</Label>
                <Select
                  value={input.course.existingCourseId?.toString()}
                  onValueChange={selectExistingCourse}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.course_id} value={course.course_id.toString()}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>
        )}

        {currentStep === 1 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Basics</h2>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={input.course.title}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    course: { ...current.course, title: event.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={input.course.description || ''}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    course: { ...current.course, description: event.target.value },
                  }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={input.course.categoryId?.toString() || undefined}
                  onValueChange={(value) =>
                    setInput((current) => ({
                      ...current,
                      course: { ...current.course, categoryId: Number(value) },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Thumbnail URL</Label>
                <Input
                  type="url"
                  value={input.course.thumbnailUrl || ''}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      course: { ...current.course, thumbnailUrl: event.target.value },
                    }))
                  }
                />
              </div>
            </div>
          </section>
        )}

        {currentStep === 2 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Pricing</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant={input.pricing.mode === 'free' ? 'default' : 'outline'}
                onClick={() => setPricingMode('free')}
              >
                Free
              </Button>
              <Button
                type="button"
                variant={input.pricing.mode === 'paid' ? 'default' : 'outline'}
                onClick={() => setPricingMode('paid')}
              >
                Paid
              </Button>
            </div>
            {input.pricing.mode === 'paid' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={input.pricing.price || 0}
                    onChange={(event) =>
                      setInput((current) => ({
                        ...current,
                        pricing: { ...current.pricing, price: Number(event.target.value) },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={input.pricing.currency || 'usd'}
                    onValueChange={(value) =>
                      setInput((current) => ({
                        ...current,
                        pricing: {
                          ...current.pricing,
                          currency: value as ProductCreationCurrency,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD</SelectItem>
                      <SelectItem value="eur">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <Select
                    value={input.pricing.paymentProvider || 'manual'}
                    onValueChange={(value) =>
                      setInput((current) => ({
                        ...current,
                        pricing: {
                          ...current.pricing,
                          paymentProvider: value as ProductCreationPaymentProvider,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </section>
        )}

        {currentStep === 3 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">After purchase</h2>
            {input.pricing.mode === 'free' ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Post-registration instructions are available for paid products in this version.
              </div>
            ) : (
              <ProductPostRegistrationEditor
                steps={input.postRegistrationSteps}
                onChange={(postRegistrationSteps: ProductPostRegistrationStepInput[]) =>
                  setInput((current) => ({ ...current, postRegistrationSteps }))
                }
              />
            )}
          </section>
        )}

        {currentStep === 4 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Review</h2>
            <ul className="space-y-2 text-sm">
              <li>Draft save: {readiness.canSaveDraft ? 'Ready' : 'Needs attention'}</li>
              <li>Publish: {readiness.canPublish ? 'Ready' : 'Needs attention'}</li>
              {readiness.issues.map((issue, index) => (
                <li key={`${issue.field}-${index}`} className="text-destructive">
                  {issue.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={currentStep === 0 || loading}
              onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={currentStep === steps.length - 1 || loading}
              onClick={() => setCurrentStep((step) => Math.min(step + 1, steps.length - 1))}
            >
              Next
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading || !readiness.canSaveDraft}
              onClick={() => submit('draft')}
            >
              Save draft
            </Button>
            <Button
              type="button"
              disabled={loading || !readiness.canPublish}
              onClick={() => submit('publish')}
            >
              Publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS or actionable TypeScript errors in wizard. Fix wizard errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add components/admin/product-creation-wizard.tsx
git commit -m "feat: add admin product creation wizard"
```

## Task 7: Wire Admin Pages

**Files:**
- Modify: `app/[locale]/dashboard/admin/products/new/page.tsx`
- Modify: `app/[locale]/dashboard/admin/products/[productId]/edit/page.tsx`

- [ ] **Step 1: Update new page**

In `app/[locale]/dashboard/admin/products/new/page.tsx`, replace `ProductForm` import:

```ts
import { ProductCreationWizard } from '@/components/admin/product-creation-wizard'
```

Fetch all tenant courses, not only published:

```ts
const [{ data: courses }, { data: categories }] = await Promise.all([
  supabase
    .from('courses')
    .select('course_id, title, description, thumbnail_url, category_id')
    .eq('tenant_id', tenantId)
    .order('title'),
  supabase
    .from('course_categories')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name'),
])
```

Replace `<ProductForm mode="create" courses={courses || []} />` with:

```tsx
<ProductCreationWizard
  mode="create"
  categories={categories || []}
  courses={courses || []}
/>
```

- [ ] **Step 2: Update edit page**

In `app/[locale]/dashboard/admin/products/[productId]/edit/page.tsx`, replace `ProductForm` import:

```ts
import { ProductCreationWizard } from '@/components/admin/product-creation-wizard'
```

Add post-registration fetch to existing `Promise.all`:

```ts
supabase
  .from('product_post_registration_steps')
  .select('id, type, title, description, url, sort_order, is_active')
  .eq('product_id', parseInt(productId))
  .eq('tenant_id', tenantId)
  .order('sort_order')
```

Build `initialInput`:

```ts
const linkedCourseId = productWithCourses.courses[0]?.course_id
const linkedCourse = courses?.find((course) => course.course_id === linkedCourseId)

type PostRegistrationRow = {
  id: number
  type: 'whatsapp' | 'telegram' | 'discord' | 'link' | 'text'
  title: string
  description: string | null
  url: string | null
  sort_order: number | null
  is_active: boolean
}

const initialInput = {
  intent: 'draft' as const,
  productId: product.product_id,
  course: {
    sourceMode: 'existing' as const,
    existingCourseId: linkedCourseId,
    title: linkedCourse?.title || product.name,
    description: linkedCourse?.description || product.description || '',
    thumbnailUrl: linkedCourse?.thumbnail_url || product.image || '',
    categoryId: linkedCourse?.category_id || null,
  },
  pricing: {
    mode: 'paid' as const,
    price: Number(product.price),
    currency: product.currency as 'usd' | 'eur',
    paymentProvider: product.payment_provider as 'manual' | 'stripe' | 'paypal',
  },
  postRegistrationSteps: ((postRegistrationSteps || []) as PostRegistrationRow[]).map((step, index) => ({
    id: step.id,
    type: step.type,
    title: step.title,
    description: step.description,
    url: step.url,
    sortOrder: step.sort_order ?? index,
    isActive: step.is_active,
  })),
}
```

Render:

```tsx
<ProductCreationWizard
  mode="edit"
  categories={categories || []}
  courses={courses || []}
  initialInput={initialInput}
/>
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 'app/[locale]/dashboard/admin/products/new/page.tsx' 'app/[locale]/dashboard/admin/products/[productId]/edit/page.tsx'
git commit -m "feat: wire admin product wizard pages"
```

## Task 8: i18n Copy

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/es.json`
- Modify: `components/admin/product-creation-wizard.tsx`
- Modify: `components/admin/product-post-registration-editor.tsx`

- [ ] **Step 1: Add English messages**

Under `dashboard.admin.products`, add:

```json
"wizard": {
  "steps": {
    "course": "Course",
    "basics": "Basics",
    "pricing": "Pricing",
    "afterPurchase": "After purchase",
    "review": "Review"
  },
  "sourceTitle": "What are you creating?",
  "createNewCourse": "Create new course",
  "useExistingCourse": "Use existing course",
  "selectCourse": "Select a course",
  "basicsTitle": "Basics",
  "title": "Title",
  "description": "Description",
  "category": "Category",
  "selectCategory": "Select category",
  "thumbnailUrl": "Thumbnail URL",
  "pricingTitle": "Pricing",
  "free": "Free",
  "paid": "Paid",
  "price": "Price",
  "currency": "Currency",
  "paymentMethod": "Payment method",
  "manual": "Manual",
  "stripe": "Stripe",
  "afterPurchaseTitle": "After purchase",
  "afterPurchaseFree": "Post-registration instructions are available for paid products in this version.",
  "afterPurchaseEmpty": "Add optional instructions students see after purchase.",
  "reviewTitle": "Review",
  "draftReady": "Draft save: {status}",
  "publishReady": "Publish: {status}",
  "ready": "Ready",
  "needsAttention": "Needs attention",
  "back": "Back",
  "next": "Next",
  "saveDraft": "Save draft",
  "publish": "Publish",
  "saved": "Draft saved",
  "published": "Offering published",
  "saveError": "Failed to save offering",
  "removeStep": "Remove step",
  "url": "URL",
  "stepTitle": "Step title"
}
```

- [ ] **Step 2: Add Spanish messages**

Under `dashboard.admin.products`, add:

```json
"wizard": {
  "steps": {
    "course": "Curso",
    "basics": "Básico",
    "pricing": "Precio",
    "afterPurchase": "Después de comprar",
    "review": "Revisión"
  },
  "sourceTitle": "¿Qué quieres crear?",
  "createNewCourse": "Crear curso nuevo",
  "useExistingCourse": "Usar curso existente",
  "selectCourse": "Selecciona un curso",
  "basicsTitle": "Básico",
  "title": "Título",
  "description": "Descripción",
  "category": "Categoría",
  "selectCategory": "Selecciona categoría",
  "thumbnailUrl": "URL de miniatura",
  "pricingTitle": "Precio",
  "free": "Gratis",
  "paid": "Pago",
  "price": "Precio",
  "currency": "Moneda",
  "paymentMethod": "Método de pago",
  "manual": "Manual",
  "stripe": "Stripe",
  "afterPurchaseTitle": "Después de comprar",
  "afterPurchaseFree": "Las instrucciones post-registro están disponibles para productos pagos en esta versión.",
  "afterPurchaseEmpty": "Agrega instrucciones opcionales para mostrar después de la compra.",
  "reviewTitle": "Revisión",
  "draftReady": "Guardar borrador: {status}",
  "publishReady": "Publicar: {status}",
  "ready": "Listo",
  "needsAttention": "Requiere atención",
  "back": "Volver",
  "next": "Siguiente",
  "saveDraft": "Guardar borrador",
  "publish": "Publicar",
  "saved": "Borrador guardado",
  "published": "Oferta publicada",
  "saveError": "No se pudo guardar la oferta",
  "removeStep": "Eliminar paso",
  "url": "URL",
  "stepTitle": "Título del paso"
}
```

- [ ] **Step 3: Replace hardcoded wizard strings**

In both wizard components, import:

```ts
import { useTranslations } from 'next-intl'
```

Inside component:

```ts
const t = useTranslations('dashboard.admin.products.wizard')
```

Replace labels, button text, toasts, and errors with `t(...)`.

- [ ] **Step 4: Run checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json components/admin/product-creation-wizard.tsx components/admin/product-post-registration-editor.tsx
git commit -m "feat: localize admin product wizard"
```

## Task 9: Playwright Tests

**Files:**
- Modify: `tests/admin/products-manual-payment.spec.ts`
- Create: `tests/playwright/admin-product-course-creation.spec.ts`

- [ ] **Step 1: Update existing product form expectations**

In `tests/admin/products-manual-payment.spec.ts`, replace direct product form labels with wizard labels:

```ts
await expect(page.getByText('What are you creating?')).toBeVisible()
await page.getByRole('button', { name: /Use existing course/i }).click()
await page.getByText(/Select a course/i).click()
```

For required field tests, move through steps and assert disabled publish:

```ts
await expect(page.getByRole('button', { name: /Publish/i })).toBeDisabled()
```

- [ ] **Step 2: Add new smoke spec**

Create `tests/playwright/admin-product-course-creation.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test'

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login')
  await page.getByLabel(/email/i).fill('admin@test.com')
  await page.getByLabel(/password/i).fill('password123')
  await page.getByRole('button', { name: /sign in|login/i }).click()
  await page.waitForURL(/dashboard/)
}

test.describe('Admin product/course creation wizard', () => {
  test('admin can create new free course draft', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard/admin/products/new')

    await page.getByRole('button', { name: /Create new course/i }).click()
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByLabel(/Title/i).fill(`Free Wizard Course ${Date.now()}`)
    await page.getByLabel(/Description/i).fill('Free course created from wizard smoke test.')
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByRole('button', { name: /Free/i }).click()
    await page.getByRole('button', { name: /Save draft/i }).click()

    await expect(page).toHaveURL(/dashboard\/admin\/products/)
  })

  test('admin can reach paid post-registration step', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard/admin/products/new')

    await page.getByRole('button', { name: /Create new course/i }).click()
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByLabel(/Title/i).fill(`Paid Wizard Course ${Date.now()}`)
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByRole('button', { name: /Paid/i }).click()
    await page.getByLabel(/Price/i).fill('25')
    await page.getByRole('button', { name: /Next/i }).click()

    await expect(page.getByText(/After purchase/i)).toBeVisible()
    await page.getByRole('button', { name: /WhatsApp/i }).click()
    await expect(page.getByLabel(/URL/i)).toBeVisible()
  })

  test('admin can choose existing course', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard/admin/products/new')

    await page.getByRole('button', { name: /Use existing course/i }).click()
    await expect(page.getByText(/Select a course/i)).toBeVisible()
  })
})
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npm run test:unit -- tests/unit/product-creation-validation.test.ts
npx playwright test tests/playwright/admin-product-course-creation.spec.ts
```

Expected: unit PASS. Playwright PASS using the same seeded `admin@test.com` credentials used by existing admin specs. If this repo's seed data changes, update only the `loginAsAdmin` credentials in this spec to match the committed test seed.

- [ ] **Step 4: Commit**

```bash
git add tests/admin/products-manual-payment.spec.ts tests/playwright/admin-product-course-creation.spec.ts
git commit -m "test: cover admin product course creation wizard"
```

## Task 10: Final Verification

**Files:**
- No code changes unless checks reveal issues.

- [ ] **Step 1: Run full validation**

Run:

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Expected: PASS.

- [ ] **Step 2: Run focused Playwright suites**

Run:

```bash
npx playwright test tests/admin/products-manual-payment.spec.ts tests/playwright/admin-product-course-creation.spec.ts
```

Expected: PASS or documented environment-only failures.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Manual browser check**

Start dev server:

```bash
npm run dev
```

Open `/dashboard/admin/products/new` as admin and verify:

- Desktop step rail works.
- Mobile top progress works.
- Free path saves without creating product.
- Paid path can add post-registration steps.
- Publish disabled until required fields are valid.
- Teacher `/dashboard/teacher/courses/new` still renders previous form.

- [ ] **Step 5: Final commit**

If verification fixes were needed:

```bash
git add app/actions/admin/products.ts components/admin/product-creation-wizard.tsx components/admin/product-post-registration-editor.tsx messages/en.json messages/es.json tests/admin/products-manual-payment.spec.ts tests/playwright/admin-product-course-creation.spec.ts
git commit -m "fix: polish admin product creation wizard"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: admin-only Guaybo-like flow, teacher unchanged, free skips product, paid creates product, post-registration for paid products, readiness-gated publish, migration, validation, and tests are all covered by tasks.
- Placeholder scan: no `TBD`, `TODO`, or unspecified “handle edge cases” steps remain. Task 4 has a compile-safe shell followed by the full replacement body before any checks run.
- Type consistency: `ProductCreationWizardInput`, `ProductPostRegistrationStepInput`, `PricingMode`, and post-registration step fields match across types, validation, wizard, server action, and tests.
