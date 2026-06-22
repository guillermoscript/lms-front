'use client'

import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type {
  PostRegistrationStepType,
  ProductPostRegistrationStepInput,
  ProductCreationValidationIssue,
} from '@/lib/admin/product-creation/types'

const stepTypeLabels: Record<PostRegistrationStepType, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  link: 'Link',
  text: 'Text',
}

const urlStepTypes = new Set<PostRegistrationStepType>([
  'whatsapp',
  'telegram',
  'discord',
  'link',
])

interface ProductPostRegistrationEditorProps {
  disabled?: boolean
  issues?: ProductCreationValidationIssue[]
  steps: ProductPostRegistrationStepInput[]
  onChange: (steps: ProductPostRegistrationStepInput[]) => void
}

function normalizeSteps(steps: ProductPostRegistrationStepInput[]) {
  return steps.map((step, index) => ({
    ...step,
    sortOrder: index,
    url: urlStepTypes.has(step.type) ? step.url || '' : null,
  }))
}

function getIssue(
  issues: ProductCreationValidationIssue[] | undefined,
  field: string,
  index?: number
) {
  const indexedField = index == null ? field : `postRegistrationSteps.${index}.${field}`
  return issues?.find(
    (issue) =>
      issue.field === indexedField ||
      issue.field === `postRegistrationSteps.${field}` ||
      issue.field === field
  )?.message
}

export function ProductPostRegistrationEditor({
  disabled = false,
  issues = [],
  steps,
  onChange,
}: ProductPostRegistrationEditorProps) {
  function addStep(type: PostRegistrationStepType) {
    onChange(
      normalizeSteps([
        ...steps,
        {
          type,
          title: stepTypeLabels[type],
          description: '',
          url: urlStepTypes.has(type) ? '' : null,
          sortOrder: steps.length,
          isActive: true,
        },
      ])
    )
  }

  function updateStep(index: number, patch: Partial<ProductPostRegistrationStepInput>) {
    onChange(
      normalizeSteps(
        steps.map((step, currentIndex) => {
          if (currentIndex !== index) {
            return step
          }

          const nextStep = { ...step, ...patch }
          return {
            ...nextStep,
            url: urlStepTypes.has(nextStep.type) ? nextStep.url || '' : null,
          }
        })
      )
    )
  }

  function removeStep(index: number) {
    onChange(normalizeSteps(steps.filter((_, currentIndex) => currentIndex !== index)))
  }

  function moveStep(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= steps.length) {
      return
    }

    const nextSteps = [...steps]
    const [step] = nextSteps.splice(index, 1)
    nextSteps.splice(nextIndex, 0, step)
    onChange(normalizeSteps(nextSteps))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(stepTypeLabels) as PostRegistrationStepType[]).map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            data-testid={type === 'whatsapp' ? 'post-registration-add-step' : undefined}
            disabled={disabled}
            onClick={() => addStep(type)}
          >
            <IconPlus data-icon="inline-start" />
            {stepTypeLabels[type]}
          </Button>
        ))}
      </div>

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs/relaxed text-muted-foreground">
          Add optional instructions students see after they complete payment.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {steps.map((step, index) => {
            const titleError = getIssue(issues, 'title', index)
            const urlError = getIssue(issues, 'url', index)
            const showUrl = urlStepTypes.has(step.type)

            return (
              <div
                key={`${step.id || 'new'}-${step.sortOrder}-${index}`}
                className="rounded-lg border bg-card p-4"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Select
                    value={step.type}
                    disabled={disabled}
                    onValueChange={(value) =>
                      updateStep(index, { type: value as PostRegistrationStepType })
                    }
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(Object.keys(stepTypeLabels) as PostRegistrationStepType[]).map(
                          (type) => (
                            <SelectItem key={type} value={type}>
                              {stepTypeLabels[type]}
                            </SelectItem>
                          )
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <Field orientation="horizontal" className="w-auto">
                      <Switch
                        id={`post-registration-step-active-${index}`}
                        size="sm"
                        checked={step.isActive}
                        disabled={disabled}
                        onCheckedChange={(checked) => updateStep(index, { isActive: checked })}
                      />
                      <FieldLabel htmlFor={`post-registration-step-active-${index}`}>
                        Active
                      </FieldLabel>
                    </Field>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled || index === 0}
                        onClick={() => moveStep(index, -1)}
                        aria-label="Move step up"
                      >
                        <IconArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled || index === steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                        aria-label="Move step down"
                      >
                        <IconArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        onClick={() => removeStep(index)}
                        aria-label="Remove step"
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  </div>
                </div>

                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field data-invalid={Boolean(titleError)}>
                      <FieldLabel htmlFor={`post-registration-step-title-${index}`}>
                        Title
                      </FieldLabel>
                      <Input
                        id={`post-registration-step-title-${index}`}
                        data-testid="post-registration-step-title"
                        value={step.title}
                        disabled={disabled}
                        aria-invalid={Boolean(titleError)}
                        onChange={(event) =>
                          updateStep(index, { title: event.target.value })
                        }
                      />
                      <FieldError>{titleError}</FieldError>
                    </Field>

                    {showUrl && (
                      <Field data-invalid={Boolean(urlError)}>
                        <FieldLabel htmlFor={`post-registration-step-url-${index}`}>
                          URL
                        </FieldLabel>
                        <Input
                          id={`post-registration-step-url-${index}`}
                          data-testid="post-registration-step-url"
                          type="url"
                          value={step.url || ''}
                          placeholder="https://"
                          disabled={disabled}
                          aria-invalid={Boolean(urlError)}
                          onChange={(event) =>
                            updateStep(index, { url: event.target.value })
                          }
                        />
                        <FieldError>{urlError}</FieldError>
                      </Field>
                    )}
                  </div>

                  <Field>
                    <FieldLabel htmlFor={`post-registration-step-description-${index}`}>
                      Description
                    </FieldLabel>
                    <Textarea
                      id={`post-registration-step-description-${index}`}
                      value={step.description || ''}
                      rows={3}
                      disabled={disabled}
                      onChange={(event) =>
                        updateStep(index, { description: event.target.value })
                      }
                    />
                    <FieldDescription>
                      Keep it short and actionable; this appears after purchase.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
