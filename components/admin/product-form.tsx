'use client'

import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
import { CourseSelector } from './course-selector'
import { createProduct, updateProduct } from '@/app/actions/admin/products'
import { PaymentProvider } from '@/lib/payments'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconAlertCircle } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface Product {
  product_id: number
  name: string
  description: string | null
  price: number
  currency: string
  image: string | null
  courses?: { course_id: number }[]
}

interface ProductFormProps {
  mode: 'create' | 'edit'
  initialData?: Product
}

export function ProductForm({ mode, initialData }: ProductFormProps) {
  const t = useTranslations('dashboard.admin.products.form')
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    price: initialData?.price || 0,
    currency: (initialData?.currency || 'usd') as 'usd' | 'eur',
    image: initialData?.image || '',
    courseIds: initialData?.courses?.map(c => c.course_id) || [],
    paymentProvider: 'manual' as PaymentProvider
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate
    if (!formData.name.trim()) {
      setError(t('errors.nameRequired'))
      setLoading(false)
      return
    }

    if (formData.price <= 0) {
      setError(t('errors.priceGreater'))
      setLoading(false)
      return
    }

    if (formData.courseIds.length === 0) {
      setError(t('errors.courseRequired'))
      setLoading(false)
      return
    }

    const result = mode === 'create'
      ? await createProduct(formData)
      : await updateProduct(initialData!.product_id, formData)

    if (result.success) {
      toast.success(mode === 'create' ? t('toasts.createSuccess') : t('toasts.updateSuccess'))
      router.push('/dashboard/admin/products')
      router.refresh()
    } else {
      setError(result.error || t('errors.generic'))
      toast.error(result.error || t('errors.generic'))
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          {t('name')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
          disabled={loading}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t('methodManual')}</SelectItem>
            <SelectItem value="stripe">{t('methodStripe')}</SelectItem>
            <SelectItem value="paypal">{t('methodPayPal')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {formData.paymentProvider === 'manual'
            ? t('methodManualHint')
            : t('methodStripeHint')}
        </p>
      </div>

      {/* Price and Currency */}
      <div className="grid gap-4 sm:grid-cols-2">
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
              <SelectItem value="usd">USD ($)</SelectItem>
              <SelectItem value="eur">EUR (€)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Image URL */}
      <div className="space-y-2">
        <Label htmlFor="image">{t('image')}</Label>
        <Input
          id="image"
          type="url"
          value={formData.image}
          onChange={(e) => setFormData({ ...formData, image: e.target.value })}
          placeholder={t('imagePlaceholder')}
          disabled={loading}
        />
      </div>

      {/* Course Selector */}
      <CourseSelector
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
