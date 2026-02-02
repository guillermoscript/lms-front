'use client'

import { useState, FormEvent } from 'react'
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
import { createPlan, updatePlan } from '@/app/actions/admin/plans'
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
  courses?: { course_id: number }[]
}

interface PlanFormProps {
  mode: 'create' | 'edit'
  initialData?: Plan
}

export function PlanForm({ mode, initialData }: PlanFormProps) {
  const [formData, setFormData] = useState({
    plan_name: initialData?.plan_name || '',
    description: initialData?.description || '',
    price: initialData?.price || 0,
    duration_in_days: initialData?.duration_in_days || 30,
    currency: (initialData?.currency || 'usd') as 'usd' | 'eur',
    features: initialData?.features || '',
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
      setError('Plan name is required')
      setLoading(false)
      return
    }

    if (formData.price <= 0) {
      setError('Price must be greater than 0')
      setLoading(false)
      return
    }

    const result = mode === 'create'
      ? await createPlan(formData)
      : await updatePlan(initialData!.plan_id, formData)

    if (result.success) {
      toast.success(`Plan ${mode === 'create' ? 'created' : 'updated'} successfully`)
      router.push('/dashboard/admin/plans')
      router.refresh()
    } else {
      setError(result.error || 'An error occurred')
      toast.error(result.error || 'An error occurred')
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Plan Name */}
      <div className="space-y-2">
        <Label htmlFor="plan_name">
          Plan Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="plan_name"
          value={formData.plan_name}
          onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
          placeholder="e.g., Premium Monthly Plan"
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
          placeholder="Describe what's included in this plan..."
          rows={4}
          disabled={loading}
        />
      </div>

      {/* Price, Currency, and Duration */}
      <div className="grid gap-4 sm:grid-cols-3">
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

        <div className="space-y-2">
          <Label htmlFor="duration">
            Duration <span className="text-destructive">*</span>
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
              <SelectItem value="30">Monthly</SelectItem>
              <SelectItem value="365">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-2">
        <Label htmlFor="features">Features (comma-separated)</Label>
        <Textarea
          id="features"
          value={formData.features}
          onChange={(e) => setFormData({ ...formData, features: e.target.value })}
          placeholder="Unlimited access, Priority support, Downloadable resources"
          rows={3}
          disabled={loading}
        />
        <p className="text-sm text-muted-foreground">
          Enter features separated by commas. These will be displayed to customers.
        </p>
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
          {loading ? 'Saving...' : mode === 'create' ? 'Create Plan' : 'Save Changes'}
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
