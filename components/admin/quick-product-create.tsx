'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconAlertTriangle, IconArrowRight } from '@tabler/icons-react'
import { saveProductCreationWizard } from '@/app/actions/admin/products'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { PricingMode, SaveIntent } from '@/lib/admin/product-creation/types'

export interface CourseLimitInfo {
  canCreate: boolean
  currentCount: number
  limit: number
  plan: string
  approaching?: boolean
  nextPlan?: string
}

interface QuickProductCreateProps {
  limitInfo: CourseLimitInfo
  className?: string
}

/**
 * One-screen quick-create: title + free/paid + price + publish.
 * Everything else (category, thumbnail, after-purchase steps, provider choice)
 * is deferred with defaults — the full wizard stays at ?advanced=1.
 */
export function QuickProductCreate({ limitInfo, className }: QuickProductCreateProps) {
  const t = useTranslations('dashboard.admin.products.new.quick')
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [pricingMode, setPricingMode] = useState<PricingMode>('free')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState<SaveIntent | null>(null)

  const priceValue = Number.parseFloat(price)
  const canPublish =
    title.trim().length > 0 &&
    (pricingMode === 'free' || (Number.isFinite(priceValue) && priceValue > 0))

  const handleSave = async (intent: SaveIntent) => {
    if (saving) return
    setSaving(intent)
    try {
      const result = await saveProductCreationWizard({
        intent,
        course: {
          sourceMode: 'new',
          title: title.trim(),
          description: '',
          thumbnailUrl: '',
          categoryId: null,
        },
        pricing:
          pricingMode === 'free'
            ? { mode: 'free' }
            : {
                mode: 'paid',
                price: priceValue,
                currency: 'usd',
                paymentProvider: 'manual',
              },
        postRegistrationSteps: [],
      })

      if (!result.success) {
        toast.error(result.error || t('saveError'))
        return
      }

      toast.success(intent === 'publish' ? t('published') : t('draftSaved'))
      router.push('/dashboard/admin/products')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveError'))
    } finally {
      setSaving(null)
    }
  }

  const atLimit = !limitInfo.canCreate

  return (
    <div className={cn('mx-auto w-full max-w-xl space-y-4', className)}>
      {atLimit ? (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertTitle>{t('limitReachedTitle')}</AlertTitle>
          <AlertDescription>
            {t('limitReachedDescription', {
              count: limitInfo.currentCount,
              limit: limitInfo.limit,
              plan: limitInfo.plan,
            })}{' '}
            <Link href="/dashboard/admin/billing" className="font-medium underline">
              {t('upgradeCta')}
            </Link>
          </AlertDescription>
        </Alert>
      ) : limitInfo.approaching ? (
        <Alert>
          <IconAlertTriangle className="size-4" />
          <AlertDescription>
            {t('limitApproaching', {
              count: limitInfo.currentCount,
              limit: limitInfo.limit,
            })}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="space-y-6">
            <Field>
              <FieldLabel htmlFor="quick-title">{t('courseTitleLabel')}</FieldLabel>
              <FieldContent>
                <Input
                  id="quick-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('courseTitlePlaceholder')}
                  disabled={atLimit}
                  maxLength={200}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>{t('pricingLabel')}</FieldLabel>
              <FieldContent>
                <RadioGroup
                  value={pricingMode}
                  onValueChange={(value) => setPricingMode(value as PricingMode)}
                  className="grid grid-cols-2 gap-3"
                >
                  {(['free', 'paid'] as const).map((mode) => (
                    <label
                      key={mode}
                      onClick={() => !atLimit && setPricingMode(mode)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm',
                        pricingMode === mode && 'border-primary bg-primary/5'
                      )}
                    >
                      <RadioGroupItem value={mode} disabled={atLimit} />
                      {t(mode)}
                    </label>
                  ))}
                </RadioGroup>
              </FieldContent>
            </Field>

            {pricingMode === 'paid' && (
              <Field>
                <FieldLabel htmlFor="quick-price">{t('priceLabel')}</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="quick-price"
                      type="number"
                      min="0.5"
                      step="0.01"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="19.99"
                      className="pl-7"
                      disabled={atLimit}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t('priceHint')}</p>
                </FieldContent>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <div className="flex w-full gap-3">
            <Button
              className="flex-1"
              onClick={() => handleSave('publish')}
              disabled={atLimit || !canPublish || saving !== null}
            >
              {saving === 'publish' ? t('publishing') : t('publish')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSave('draft')}
              disabled={atLimit || title.trim().length === 0 || saving !== null}
            >
              {saving === 'draft' ? t('savingDraft') : t('saveDraft')}
            </Button>
          </div>
          <Link
            href="/dashboard/admin/products/new?advanced=1"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t('moreOptions')}
            <IconArrowRight className="size-3.5" />
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
