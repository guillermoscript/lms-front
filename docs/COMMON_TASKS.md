# Common Tasks - Quick Reference

> Quick copy-paste solutions for frequent development tasks

## Authentication

### Get Current User
```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
```

### Get User Role
```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'

// Returns the tenant-scoped role from tenant_users table
// Falls back to global user_role if no tenant role found
const role = await getUserRole() // 'student' | 'teacher' | 'admin' | null
```

### Get Tenant Context
```typescript
import { getCurrentTenantId } from '@/lib/supabase/tenant'

const tenantId = await getCurrentTenantId() // reads x-tenant-id header set by proxy.ts
```

### Protect a Page
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProtectedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Page content...
}
```

### Require Specific Role
```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'

export default async function TeacherOnlyPage() {
  const role = await getUserRole()

  if (role !== 'teacher' && role !== 'admin') {
    redirect('/dashboard')
  }

  // Page content...
}
```

## Database Queries

> **IMPORTANT:** All queries on tenant-scoped tables MUST include a `tenant_id` filter. RLS is enabled, but explicit filters are required for clarity and performance.

### Standard Query Pattern (Server Components)
```typescript
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

const supabase = await createClient()
const tenantId = await getCurrentTenantId()

const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('status', 'published')
```

### Admin Client (Bypass RLS)
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

// Use for service-role operations — bypasses RLS
const adminClient = createAdminClient()
const tenantId = await getCurrentTenantId()

// IMPORTANT: Manually validate tenant ownership before writes
const { data: resource } = await adminClient
  .from('products')
  .select('tenant_id')
  .eq('product_id', id)
  .single()

if (resource.tenant_id !== tenantId) throw new Error('Access denied')
```

### Simple Select
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('status', 'published')
```

### Select with Filter
```typescript
const { data } = await supabase
  .from('lessons')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('course_id', courseId)
  .eq('status', 'published')
  .order('sequence', { ascending: true })
```

### Select Single Record
```typescript
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('course_id', courseId)
  .single()

if (!data) {
  redirect('/404')
}
```

### Select with Relations (Join)
```typescript
const { data } = await supabase
  .from('courses')
  .select(`
    *,
    author:profiles (
      full_name,
      avatar_url
    ),
    lessons (
      lesson_id,
      title,
      sequence
    )
  `)
  .eq('tenant_id', tenantId)
  .eq('course_id', courseId)
  .single()
```

### Insert
```typescript
const { data, error } = await supabase
  .from('courses')
  .insert({
    title: 'New Course',
    author_id: userId,
    tenant_id: tenantId,
    status: 'draft',
  })
  .select()
  .single()
```

### Update
```typescript
const { data, error } = await supabase
  .from('courses')
  .update({ status: 'published' })
  .eq('tenant_id', tenantId)
  .eq('course_id', courseId)
  .select()
```

### Delete
```typescript
const { error } = await supabase
  .from('courses')
  .delete()
  .eq('tenant_id', tenantId)
  .eq('course_id', courseId)
```

### Count Records
```typescript
const { count } = await supabase
  .from('enrollments')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .eq('user_id', userId)
```

### Call Database Function
```typescript
const { data, error } = await supabase.rpc('enroll_user', {
  _user_id: userId,
  _product_id: productId,
})
```

## UI Components

### Button Component

Button uses `@base-ui/react` — it does **not** support the `asChild` prop. To make a button act as a link, wrap `<Link>` around `<Button>`:

```typescript
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// Correct — wrap Link around Button
<Link href="/dashboard">
  <Button>Go to Dashboard</Button>
</Link>

// Wrong — asChild is not supported
<Button asChild>
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>
```

### BreadcrumbLink (base-ui render prop)
```typescript
import { BreadcrumbLink } from '@/components/ui/breadcrumb'
import Link from 'next/link'

// Correct — use render prop
<BreadcrumbLink render={<Link href="/dashboard" />}>
  Dashboard
</BreadcrumbLink>

// Wrong — asChild is not supported
<BreadcrumbLink asChild>
  <Link href="/dashboard">Dashboard</Link>
</BreadcrumbLink>
```

### DropdownMenuTrigger (base-ui render prop)
```typescript
import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

// Correct — use render prop
<DropdownMenuTrigger render={<Button variant="outline">Options</Button>} />

// Wrong — asChild is not supported
<DropdownMenuTrigger asChild>
  <Button variant="outline">Options</Button>
</DropdownMenuTrigger>
```

### Feature Gating

#### Component-based gating
```typescript
import { FeatureGate } from '@/components/shared/feature-gate'

// Only renders children if the tenant's plan includes the feature
<FeatureGate feature="landing_pages">
  <LandingPageBuilder />
</FeatureGate>
```

#### Hook-based gating
```typescript
'use client'

import { usePlanFeatures } from '@/lib/hooks/use-plan-features'

export function MyComponent() {
  const { features, isLoading } = usePlanFeatures()

  if (isLoading) return <Spinner />

  return (
    <div>
      <p>Current plan: {features.plan_name}</p>
      <p>Course limit: {features.max_courses}</p>
      {features.has_landing_pages && <LandingPageLink />}
    </div>
  )
}
```

### Basic Page Layout
```typescript
export default function Page() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Page Title</h1>

        {/* Content */}
      </div>
    </div>
  )
}
```

### Card Component
```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
</Card>
```

### Button Variants
```typescript
import { Button } from '@/components/ui/button'

<Button>Click Me</Button>
<Button variant="outline">Outline</Button>
<Button variant="destructive">Delete</Button>
<Button disabled>Disabled</Button>
```

### Form with Client Component
```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MyForm({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const title = formData.get('title') as string

    const { error } = await supabase
      .from('courses')
      .insert({ title, tenant_id: tenantId })

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Save'}
      </Button>
    </form>
  )
}
```

### Loading State
```typescript
// app/[locale]/page/loading.tsx
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}
```

### Error Boundary
```typescript
// app/[locale]/page/error.tsx
'use client'

import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
```

## Client-Side Actions

### Mark Lesson as Complete
```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function CompleteLessonButton({ lessonId }: { lessonId: number }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleComplete() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // NOTE: lesson_completions uses `user_id`, NOT `student_id`
    await supabase.from('lesson_completions').insert({
      lesson_id: lessonId,
      user_id: user.id,
    })

    setLoading(false)
    router.refresh() // Refresh server data
  }

  return (
    <Button onClick={handleComplete} disabled={loading}>
      {loading ? 'Marking...' : 'Mark Complete'}
    </Button>
  )
}
```

### Delete with Confirmation
```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function DeleteCourseButton({ courseId, tenantId }: { courseId: string; tenantId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleDelete() {
    setLoading(true)

    await supabase
      .from('courses')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)

    router.push('/dashboard/teacher/courses')
    router.refresh()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive">Delete Course</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            course and all its lessons.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

## Common Queries

### Get Student's Enrolled Courses
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

const { data: enrollments } = await supabase
  .from('enrollments')
  .select(`
    *,
    course:courses (
      *,
      author:profiles (
        full_name
      )
    )
  `)
  .eq('tenant_id', tenantId)
  .eq('user_id', userId)
  .eq('status', 'active')
```

### Get Course with Progress
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

// NOTE: lesson_completions uses `user_id`, NOT `student_id`
const { data } = await supabase
  .from('courses')
  .select(`
    *,
    lessons (
      lesson_id,
      title,
      sequence,
      lesson_completions!inner (
        completed_at
      )
    )
  `)
  .eq('tenant_id', tenantId)
  .eq('course_id', courseId)
  .eq('lessons.lesson_completions.user_id', userId)
  .single()

// Calculate progress
const totalLessons = data.lessons.length
const completedLessons = data.lessons.filter(
  (l) => l.lesson_completions.length > 0
).length
const progress = (completedLessons / totalLessons) * 100
```

### Get Teacher's Courses
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

const { data } = await supabase
  .from('courses')
  .select(`
    *,
    lessons (count),
    enrollments (count)
  `)
  .eq('tenant_id', tenantId)
  .eq('author_id', userId)
  .order('created_at', { ascending: false })
```

### Get Exam with Questions
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

const { data: exam } = await supabase
  .from('exams')
  .select(`
    *,
    exam_questions (
      *,
      question_options (*)
    )
  `)
  .eq('tenant_id', tenantId)
  .eq('exam_id', examId)
  .order('sequence', { foreignTable: 'exam_questions' })
  .order('sequence', { foreignTable: 'exam_questions.question_options' })
  .single()
```

## Role Management

### Check if User is Admin
```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'

const role = await getUserRole()
const isAdmin = role === 'admin'
```

### Assign Role to User (Admin Only)
```typescript
// Via SQL in Supabase Studio
INSERT INTO user_roles (user_id, role)
VALUES ('user-uuid', 'teacher')
ON CONFLICT (user_id, role) DO NOTHING;
```

### Remove Role from User
```typescript
// Via SQL in Supabase Studio
DELETE FROM user_roles
WHERE user_id = 'user-uuid' AND role = 'teacher';
```

## Utilities

### Format Date
```typescript
const formattedDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(new Date(dateString))
```

### Conditional Classes (cn utility)
```typescript
import { cn } from '@/lib/utils'

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  isDisabled && "disabled-classes"
)}>
```

### Debounce Search
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'

export function SearchInput() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)

    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (debouncedSearch) {
      // Perform search
      console.log('Searching for:', debouncedSearch)
    }
  }, [debouncedSearch])

  return (
    <Input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search..."
    />
  )
}
```

## Responsive Design

### Grid Layout
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Cards */}
</div>
```

### Hide on Mobile
```typescript
<div className="hidden md:block">
  {/* Desktop only */}
</div>
```

### Mobile Menu
```typescript
<div className="md:hidden">
  {/* Mobile only */}
</div>
```

## Error Handling

### Try-Catch with Toast
```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'

async function handleSubmit() {
  try {
    const { error } = await supabase
      .from('courses')
      .insert({ ...data, tenant_id: tenantId })

    if (error) throw error

    toast.success('Course created successfully!')
  } catch (error) {
    console.error('Error:', error)
    toast.error('Failed to create course')
  }
}
```

### Check for Errors
```typescript
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)

if (error) {
  console.error('Database error:', error)
  return // or redirect, or show error UI
}

// Now safe to use data
```

## Common Tailwind Patterns

```typescript
// Container
<div className="max-w-7xl mx-auto px-4 py-8">

// Flex centering
<div className="flex items-center justify-center min-h-screen">

// Card
<div className="bg-card border border-border rounded-lg p-6">

// Button-like link
<Link href="/" className="inline-flex items-center justify-center rounded-md px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90">

// Responsive spacing
<div className="space-y-4 md:space-y-6 lg:space-y-8">

// Truncate text
<p className="truncate">Very long text that will be truncated...</p>

// Line clamp
<p className="line-clamp-3">Text that will show max 3 lines...</p>
```
