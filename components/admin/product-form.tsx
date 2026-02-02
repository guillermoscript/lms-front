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
      setError('Product name is required')
      setLoading(false)
      return
    }

    if (formData.price <= 0) {
      setError('Price must be greater than 0')
      setLoading(false)
      return
    }

    if (formData.courseIds.length === 0) {
      setError('Please select at least one course')
      setLoading(false)
      return
    }

    const result = mode === 'create'
      ? await createProduct(formData)
      : await updateProduct(initialData!.product_id, formData)

    if (result.success) {
      toast.success(`Product ${mode === 'create' ? 'created' : 'updated'} successfully`)
      router.push('/dashboard/admin/products')
      router.refresh()
    } else {
      setError(result.error || 'An error occurred')
      toast.error(result.error || 'An error occurred')
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          Product Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Complete Web Development Bundle"
          required
          disabled={loading}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe what's included in this product..."
          rows={4}
          disabled={loading}
        />
      </div>

      {/* Payment Provider */}
      <div className="space-y-2">
        <Label htmlFor="paymentProvider">
          Payment Method <span className="text-destructive">*</span>
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
            <SelectItem value="manual">Manual/Offline Payment (Bank Transfer, Invoice)</SelectItem>
            <SelectItem value="stripe">Stripe (Credit Card, Online)</SelectItem>
            <SelectItem value="paypal">PayPal (Coming Soon)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {formData.paymentProvider === 'manual'
            ? 'Students will contact you to arrange offline payment (bank transfer, invoice, etc.)'
            : 'Students can pay online instantly'}
        </p>
      </div>

      {/* Price and Currency */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">
            Price <span className="text-destructive">*</span>
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
            Currency <span className="text-destructive">*</span>
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
        <Label htmlFor="image">Image URL (optional)</Label>
        <Input
          id="image"
          type="url"
          value={formData.image}
          onChange={(e) => setFormData({ ...formData, image: e.target.value })}
          placeholder="https://example.com/image.jpg"
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
          {loading ? 'Saving...' : mode === 'create' ? 'Create Product' : 'Save Changes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
