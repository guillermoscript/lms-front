'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { CourseSelector, type CourseOption } from './course-selector'
import { createPlan, updatePlan } from '@/app/actions/admin/plans'
import type { PaymentProvider } from '@/lib/payments'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconAlertCircle } from '@tabler/icons-react'

interface Plan {
  plan_id: number
  plan_name: string
  description: string | null
  price: number
  duration_in_days: number
  currency: string
  features: string | null
  payment_provider?: string
  provider_price_id?: string | null
  courses?: { course_id: number }[]
}

interface PlanFormProps {
  mode: 'create' | 'edit'
  initialData?: Plan
  courses: CourseOption[]
  /** Providers the admin enabled in Settings → Payment. `manual` is always available. */
  enabledProviders?: string[]
}

export function PlanForm({ mode, initialData, courses, enabledProviders = [] }: PlanFormProps) {
  const t = useTranslations('dashboard.admin.plans.form')

  // Which providers to show: the enabled ones + manual (always) + the plan's
  // current provider in edit mode (so an existing pick never disappears even if
  // its toggle was later turned off).
  const visibleProviders = new Set<string>([
    'manual',
    ...enabledProviders,
    ...(initialData?.payment_provider ? [initialData.payment_provider] : []),
  ])
  const defaultProvider = (initialData?.payment_provider
    || (enabledProviders.includes('stripe') ? 'stripe' : 'manual')) as PaymentProvider

  const [formData, setFormData] = useState({
    plan_name: initialData?.plan_name || '',
    description: initialData?.description || '',
    price: initialData?.price || 0,
    duration_in_days: initialData?.duration_in_days || 30,
    currency: (initialData?.currency || 'usd') as 'usd' | 'eur',
    features: initialData?.features || '',
    paymentProvider: defaultProvider,
    providerPriceId: initialData?.provider_price_id || '',
    courseIds: initialData?.courses?.map(c => c.course_id) || []
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate
    if (!formData.plan_name.trim()) {
      setError(t('errors.nameRequired'))
      setLoading(false)
      return
    }

    if (formData.price <= 0) {
      setError(t('errors.priceGreater'))
      setLoading(false)
      return
    }

    const result = mode === 'create'
      ? await createPlan(formData)
      : await updatePlan(initialData!.plan_id, formData)

    if (result.success) {
      toast.success(mode === 'create' ? t('toasts.createSuccess') : t('toasts.updateSuccess'))
      router.push('/dashboard/admin/plans')
      router.refresh()
    } else {
      setError(result.error || t('errors.generic'))
      toast.error(result.error || t('errors.generic'))
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Plan Name */}
      <div className="space-y-2">
        <Label htmlFor="plan_name">
          {t('name')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="plan_name"
          value={formData.plan_name}
          onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
          placeholder={t('namePlaceholder')}
          required
          disabled={loading}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">{t('description')}</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder={t('descriptionPlaceholder')}
          rows={4}
          disabled={loading}
        />
      </div>

      {/* Payment Provider */}
      <div className="space-y-2">
        <Label htmlFor="paymentProvider">
          {t('method')} <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.paymentProvider}
          onValueChange={(value) => setFormData({ ...formData, paymentProvider: value as PaymentProvider })}
          disabled={loading || mode === 'edit'}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t('methodManual')}</SelectItem>
            {visibleProviders.has('stripe') && <SelectItem value="stripe">{t('methodStripe')}</SelectItem>}
            {visibleProviders.has('paypal') && <SelectItem value="paypal">{t('methodPaypal')}</SelectItem>}
            {visibleProviders.has('lemonsqueezy') && <SelectItem value="lemonsqueezy">{t('methodLemonsqueezy')}</SelectItem>}
            {visibleProviders.has('solana') && <SelectItem value="solana">{t('methodSolana')}</SelectItem>}
            {visibleProviders.has('solana_subs') && <SelectItem value="solana_subs">{t('methodSolanaSubs')}</SelectItem>}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {t(`methodHint.${formData.paymentProvider}`)}
        </p>
      </div>

      {/* Lemon Squeezy variant id (→ provider_price_id). Required for LS checkout. */}
      {formData.paymentProvider === 'lemonsqueezy' && (
        <div className="space-y-2">
          <Label htmlFor="providerPriceId">
            {t('variantIdLabel')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="providerPriceId"
            value={formData.providerPriceId}
            onChange={(e) => setFormData({ ...formData, providerPriceId: e.target.value })}
            placeholder={t('variantIdPlaceholder')}
            disabled={loading}
          />
          <p className="text-sm text-muted-foreground">{t('variantIdHint')}</p>
        </div>
      )}

      {/* Solana providers need a wallet configured in Settings → Payment. */}
      {(formData.paymentProvider === 'solana' || formData.paymentProvider === 'solana_subs') && (
        <Alert>
          <IconAlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('solanaWalletHint')}{' '}
            <Link
              href="/dashboard/admin/settings"
              className="font-medium underline underline-offset-4"
            >
              {t('solanaWalletCta')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Price, Currency, and Duration */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="price">
            {t('price')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="price"
            type="number"
            min="0.01"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">
            {t('currency')} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.currency}
            onValueChange={(value) => setFormData({ ...formData, currency: value as 'usd' | 'eur' })}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usd">{t('currencyUsd')}</SelectItem>
              <SelectItem value="eur">{t('currencyEur')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration">
            {t('duration')} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.duration_in_days.toString()}
            onValueChange={(value) => setFormData({ ...formData, duration_in_days: parseInt(value || '30') })}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">{t('durationMonthly')}</SelectItem>
              <SelectItem value="365">{t('durationYearly')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-2">
        <Label htmlFor="features">{t('features')}</Label>
        <Textarea
          id="features"
          value={formData.features}
          onChange={(e) => setFormData({ ...formData, features: e.target.value })}
          placeholder={t('featuresPlaceholder')}
          rows={3}
          disabled={loading}
        />
        <p className="text-sm text-muted-foreground">
          {t('featuresHint')}
        </p>
      </div>

      {/* Course Selector */}
      <CourseSelector
        courses={courses}
        selectedCourses={formData.courseIds}
        onChange={(courseIds) => setFormData({ ...formData, courseIds })}
      />

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? t('saving') : mode === 'create' ? t('create') : t('save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
