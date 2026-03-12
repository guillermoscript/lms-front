# Development Workflow

## Day-to-Day Development

### Starting Your Day

1. **Pull latest changes**:
   ```bash
   git pull origin master
   ```

2. **Install any new dependencies**:
   ```bash
   npm install
   ```

3. **Check for database changes**:
   ```bash
   supabase db pull  # If using cloud
   # Or
   supabase db push  # To apply local migrations
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

## Feature Development Process

### 1. Plan the Feature

**Questions to ask**:
- Which user role is this for?
- What data do we need from the database?
- Is there similar functionality already?
- Do we need new database tables/columns?

**Example**: Adding "Course Progress" for students

- **Role**: Student
- **Data**: `lesson_completions`, `lessons` (count)
- **Similar**: Enrollment tracking already exists
- **New tables**: No

### 2. Update Database (if needed)

```bash
# Create migration
supabase migration new add_feature_name

# Edit supabase/migrations/TIMESTAMP_add_feature_name.sql
```

Example migration:
```sql
-- Add column to existing table
ALTER TABLE courses
ADD COLUMN difficulty VARCHAR(50) DEFAULT 'beginner';

-- Create new table
CREATE TABLE course_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  progress_percentage NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

-- Enable RLS
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;

-- Add RLS policy
CREATE POLICY "Users can view their own progress"
ON course_progress FOR SELECT
USING (auth.uid() = user_id);
```

Apply migration:
```bash
supabase db push
```

### 3. Create the Page/Component

**File structure** (all routes live under `app/[locale]/`):
```
app/[locale]/dashboard/student/courses/[courseId]/
├── page.tsx          # Main server component
├── loading.tsx       # Loading state (optional)
└── error.tsx         # Error boundary (optional)
```

**Example page.tsx**:
```typescript
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { CourseView } from './CourseView'

export default async function CoursePage({
  params,
}: {
  params: { courseId: string }
}) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch data with RLS — always filter by tenant_id
  const { data: course, error } = await supabase
    .from('courses')
    .select(`
      *,
      lessons (
        id,
        title,
        sequence,
        lesson_completions (
          completed_at
        )
      ),
      enrollments!inner (
        enrolled_at
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('id', params.courseId)
    .eq('lessons.lesson_completions.user_id', user.id)
    .eq('enrollments.user_id', user.id)
    .single()

  if (error || !course) {
    redirect('/dashboard/student/courses')
  }

  return <CourseView course={course} userId={user.id} />
}
```

### 4. Build UI Components

**Create client component** (if needed):

```typescript
'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface CourseViewProps {
  course: Course
  userId: string
}

export function CourseView({ course, userId }: CourseViewProps) {
  const completedLessons = course.lessons.filter(
    (l) => l.lesson_completions.length > 0
  ).length

  const totalLessons = course.lessons.length
  const progress = (completedLessons / totalLessons) * 100

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{course.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>
                {completedLessons}/{totalLessons} lessons
              </span>
            </div>
            <Progress value={progress} />
          </div>
        </CardContent>
      </Card>

      {/* More UI... */}
    </div>
  )
}
```

### 5. Add Interactivity (if needed)

**Example: Mark lesson as complete**:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function CompleteLessonButton({
  lessonId,
  isCompleted,
}: {
  lessonId: number
  isCompleted: boolean
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleComplete() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    if (isCompleted) {
      // Uncomplete — lesson_completions uses user_id (NOT student_id)
      await supabase
        .from('lesson_completions')
        .delete()
        .eq('lesson_id', lessonId)
        .eq('user_id', user.id)
    } else {
      // Complete — lesson_completions uses user_id (NOT student_id)
      await supabase.from('lesson_completions').insert({
        lesson_id: lessonId,
        user_id: user.id,
      })
    }

    setLoading(false)
    window.location.reload() // Refresh to show updated state
  }

  return (
    <Button onClick={handleComplete} disabled={loading}>
      {loading ? 'Saving...' : isCompleted ? 'Mark Incomplete' : 'Mark Complete'}
    </Button>
  )
}
```

### 6. Test Locally

**Manual testing checklist**:
- Page loads without errors
- Data displays correctly
- Loading states work
- Error states work
- Interactions work (buttons, forms, etc.)
- Mobile responsive
- Role-based access works (test as different roles)

### 7. Commit Changes

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add course progress tracking for students

- Add course_progress table with RLS
- Create course progress page
- Add progress indicator component
- Show completed/total lessons count"

# Push to branch
git push origin master
```

## UI Development Patterns

### Using Shadcn Components

```bash
# Add component
npx shadcn@latest add [component-name]

# Examples
npx shadcn@latest add card
npx shadcn@latest add button
npx shadcn@latest add form
npx shadcn@latest add dialog
```

### Base UI Component Gotchas

This project uses `@base-ui/react` under the hood for several Shadcn components. This changes how certain props work:

**Button** -- no `asChild` prop. Wrap `<Link>` around `<Button>` instead:
```typescript
// Correct
<Link href="/dashboard">
  <Button>Go to Dashboard</Button>
</Link>

// Wrong -- asChild does not exist on this Button
<Button asChild>
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>
```

**DropdownMenuTrigger** -- uses `render` prop, NOT `asChild`:
```typescript
// Correct
<DropdownMenuTrigger render={<Button variant="outline">Open Menu</Button>} />

// Wrong
<DropdownMenuTrigger asChild>
  <Button variant="outline">Open Menu</Button>
</DropdownMenuTrigger>
```

**BreadcrumbLink** -- uses `render` prop:
```typescript
// Correct
<BreadcrumbLink render={<Link href="/dashboard" />}>Dashboard</BreadcrumbLink>

// Wrong
<BreadcrumbLink asChild>
  <Link href="/dashboard">Dashboard</Link>
</BreadcrumbLink>
```

### Component Organization

```
components/
├── ui/                    # Shadcn components (auto-generated)
│   ├── button.tsx
│   ├── card.tsx
│   └── ...
├── student/              # Student-specific components
│   ├── course-card.tsx
│   └── lesson-viewer.tsx
├── teacher/              # Teacher-specific components
│   ├── course-form.tsx
│   ├── exam-builder.tsx
│   └── block-editor/    # Rich content editor (see below)
└── shared/               # Shared components
    ├── navbar.tsx
    └── footer.tsx
```

### Styling Guidelines

```typescript
// GOOD: Use Tailwind utility classes
<div className="flex items-center gap-4 p-6 bg-card border border-border rounded-lg">
  <h2 className="text-2xl font-bold">Title</h2>
</div>

// GOOD: Use cn() for conditional classes
import { cn } from '@/lib/utils'

<div className={cn(
  "p-4 rounded-lg",
  isActive && "bg-primary text-primary-foreground",
  isDisabled && "opacity-50 cursor-not-allowed"
)}>

// BAD: Inline styles
<div style={{ padding: '24px', backgroundColor: '#fff' }}>
```

## Middleware

**`proxy.ts` is the ONLY middleware file.** Do NOT create a `middleware.ts` file -- it will conflict.

`proxy.ts` handles:
1. Subdomain extraction and tenant resolution
2. `x-tenant-id` header injection
3. `tenant_users` membership checks (redirects non-members to `/join-school`)
4. Role-based route guards (`/dashboard/student`, `/dashboard/teacher`, `/dashboard/admin`)
5. i18n locale detection

**Getting tenant context in server components:**
```typescript
import { getCurrentTenantId } from '@/lib/supabase/tenant'
const tenantId = await getCurrentTenantId() // reads x-tenant-id header
```

## Database Development

### Writing Queries

**All queries MUST filter by `tenant_id`** -- RLS is enabled on all tenant-scoped tables, but explicit filters are still required for clarity and performance.

**Simple queries**:
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

// SELECT
const { data } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('status', 'published')

// INSERT
const { data } = await supabase
  .from('courses')
  .insert({ title: 'New Course', author_id: userId, tenant_id: tenantId })
  .select()
  .single()

// UPDATE
const { data } = await supabase
  .from('courses')
  .update({ status: 'published' })
  .eq('tenant_id', tenantId)
  .eq('id', courseId)

// DELETE
const { data } = await supabase
  .from('courses')
  .delete()
  .eq('tenant_id', tenantId)
  .eq('id', courseId)
```

**Complex queries with joins**:
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

const { data } = await supabase
  .from('courses')
  .select(`
    id,
    title,
    author:profiles (
      full_name,
      avatar_url
    ),
    lessons (
      id,
      title,
      sequence
    ),
    enrollments (count)
  `)
  .eq('tenant_id', tenantId)
  .eq('status', 'published')
  .order('created_at', { ascending: false })
```

**Calling database functions**:
```typescript
// RPC (Remote Procedure Call)
const { data } = await supabase.rpc('enroll_user', {
  _user_id: userId,
  _product_id: productId,
})
```

### Important Schema Notes

- **`lesson_completions`** uses `user_id`, NOT `student_id`
- **`exam_submissions`** uses `student_id` and `submission_date` (not `user_id`/`submitted_at`)
- **`product_courses`** can have multiple rows per course -- NEVER use `.single()` on it
- **`profiles`** is global (no `tenant_id` column) and has NO `email` column
- **Transaction `status`** values: `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded` (note: `successful`, not `succeeded`)

### Client Imports

- Server components / Route Handlers: `createClient()` from `@/lib/supabase/server`
- Client components: `createClient()` from `@/lib/supabase/client`
- Admin operations (bypass RLS): `createAdminClient()` from `@/lib/supabase/admin`

### Testing RLS Policies

```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

// Test as different users
const { data: studentData } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)

// If RLS is working correctly:
// - Students see only enrolled courses
// - Teachers see only their courses
// - Admins see all courses within the tenant
```

## Multi-Tenant Testing

### Local Subdomain Testing

Set `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000` in your `.env.local` for local subdomain testing. `lvh.me` resolves to `127.0.0.1`, so subdomains work without `/etc/hosts` changes.

**Access different tenants locally:**
```
http://school-slug.lvh.me:3000        # Accesses tenant with slug "school-slug"
http://another-school.lvh.me:3000     # Accesses tenant with slug "another-school"
http://lvh.me:3000                    # Platform root (no tenant)
```

### Simulating Subdomains in Development

If you cannot use `lvh.me`, pass the `x-tenant-slug` header to simulate a subdomain:
```bash
curl -H "x-tenant-slug: my-school" http://localhost:3000/api/courses
```

### Test Accounts

| Email | Role | Tenant |
|-------|------|--------|
| `student@e2etest.com` | Student | Default School |
| `owner@e2etest.com` | Admin | Default School |
| `creator@codeacademy.com` | Admin | Code Academy Pro |
| `alice@student.com` | Student | Code Academy Pro |

All passwords: `password123`

## Content Editors

### Puck Landing Page Editor

The platform includes a visual drag-and-drop landing page builder powered by Puck v0.20.

- **Config**: `lib/puck/config.ts` -- 32 components across 4 categories
- **Components**: `lib/puck/components/{primitives,layout,lms,navigation}/`
- **Templates**: `lib/puck/templates/index.ts` -- 8 built-in templates (Blank, Modern Academy, Minimal, Bold Creator, Course Catalog, About, Contact, FAQ)
- **Editor**: `components/admin/landing-page/puck-editor.tsx` (client component wrapping `<Puck>`)
- **Renderer**: `components/public/landing-page/puck-page-renderer.tsx` (client component using `<Render>`)
- **Asset upload**: `app/actions/admin/landing-page-assets.ts`
- **Server actions**: `app/actions/admin/landing-pages.ts`
- **DB storage**: `landing_pages.puck_data` (JSONB column)

Layout components use `DropZone` from `@measured/puck` and must be client components.

### Block Editor (Lesson Content)

The block editor lets teachers create rich lesson content using a structured block system.

- **Location**: `components/teacher/block-editor/`
- **Block types**: 22 block types (text, code, image, video, quiz, etc.)
- **Serialization**: Blocks serialize to MDX via `serializer.ts`
- **Drag and drop**: Powered by `@dnd-kit` for block reordering
- **Note**: Use `nanoid()` for IDs instead of `crypto.randomUUID()` (the latter fails on HTTP)

## Testing Strategy

### Manual Testing

1. **Happy Path**:
   - Normal user flow works
   - Data saves correctly
   - UI updates properly

2. **Error Cases**:
   - What if user is not logged in?
   - What if data does not exist?
   - What if query fails?

3. **Edge Cases**:
   - Empty state (no courses, no lessons)
   - Very long text (course titles, descriptions)
   - Special characters in input
   - Concurrent updates

### E2E Tests

E2E tests live in `tests/playwright/`. Run them with:
```bash
npx playwright test                    # Run all E2E tests
npx playwright test --ui               # Interactive test runner
npx playwright test -g "test name"     # Run single test
```

### Pre-Commit Checklist

Before every commit, verify:
- [ ] `npm run build` passes (TypeScript + lint check)
- [ ] `tenant_id` filter on every database query
- [ ] Tested with all relevant roles (student, teacher, admin)
- [ ] Loading and error states handled
- [ ] No console errors
- [ ] Feature works on mobile (responsive)

### Testing Checklist

Before requesting review:
- [ ] Feature works in Chrome
- [ ] Feature works on mobile (responsive)
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Empty states display correctly
- [ ] No console errors
- [ ] No TypeScript errors (`npm run build`)
- [ ] RLS policies allow correct access
- [ ] Unauthorized users cannot access protected resources

## Debugging

### Common Issues and Solutions

**Issue**: "User not authenticated"
```typescript
// Use getUser() for server-verified auth (NOT getSession())
const { data: { user } } = await supabase.auth.getUser()

// Refresh if needed
const { data } = await supabase.auth.refreshSession()
```

**Issue**: Query returns empty array
```typescript
const supabase = await createClient()
const tenantId = await getCurrentTenantId()

// Check RLS policies -- make sure tenant_id filter is included
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)

console.log('Error:', error) // Will show RLS violations
```

**Issue**: "Cannot read property of undefined"
```typescript
// Always check if data exists
const { data: course } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('id', courseId)
  .single()

if (!course) {
  redirect('/404')
}

// Now safe to use course.title, etc.
```

**Issue**: After switching tenants, data is stale
```typescript
// After a tenant switch, always refresh the session to get updated JWT claims
await supabase.auth.refreshSession()
```

### Using Browser DevTools

1. **Network tab**: Check Supabase API calls
2. **Console**: Check for errors and logs
3. **React DevTools**: Inspect component state
4. **Application tab**: Check cookies/localStorage

## Adding Dependencies

```bash
# Install dependency
npm install package-name

# Install dev dependency
npm install -D package-name

# Update package.json
# Commit both package.json and package-lock.json
git add package.json package-lock.json
git commit -m "chore: add package-name dependency"
```

**Before adding**:
- Check if functionality exists in existing deps
- Read package documentation
- Check bundle size impact
- Verify it is actively maintained

## Deployment Workflow

### Before Deploying

1. **Build locally**:
   ```bash
   npm run build
   ```

2. **Check for errors**:
   - TypeScript errors
   - ESLint warnings
   - Build errors

3. **Test production build**:
   ```bash
   npm run start
   ```

### Database Migrations

**Cloud deployment**:
```bash
# Push migrations to cloud
supabase db push --linked

# Or via Supabase Dashboard
# -> Database -> Migrations -> Run pending migrations
```

### Vercel Deployment

**Automatic** (when pushing to master):
- Vercel detects push
- Runs `npm run build`
- Deploys to production

**Manual**:
```bash
vercel deploy
```

## Code Review Checklist

Before requesting review:
- [ ] Code follows existing patterns
- [ ] No console.log statements (except intentional logging)
- [ ] No commented-out code
- [ ] No TODOs without context
- [ ] Proper error handling
- [ ] Loading states implemented
- [ ] Mobile responsive
- [ ] TypeScript types are correct
- [ ] RLS policies tested
- [ ] All queries filter by `tenant_id`
- [ ] Documentation updated (if needed)

## Best Practices

### DO
- Use TypeScript strictly
- Handle loading and error states
- Make components responsive
- Use Shadcn components when available
- Filter all queries by `tenant_id`
- Test as different roles
- Write meaningful commit messages
- Keep functions small and focused
- Use descriptive variable names
- Use `getUser()` for auth checks (server-verified)

### DO NOT
- Skip error handling
- Use `any` type (except for Stripe API v2025 type workarounds)
- Bypass RLS for convenience
- Commit `.env.local`
- Leave console.logs in production code
- Over-engineer simple features
- Duplicate code without good reason
- Ignore TypeScript errors
- Create a `middleware.ts` file (use `proxy.ts` only)
- Use `.single()` on `product_courses` queries
- Use `student_id` on `lesson_completions` (use `user_id`)

## Resources

- **Next.js Docs**: https://nextjs.org/docs
- **Supabase Docs**: https://supabase.com/docs
- **Shadcn UI**: https://ui.shadcn.com
- **Tailwind CSS**: https://tailwindcss.com
- **Puck Editor**: https://puckeditor.com
- **Project Docs**: Check `docs/` folder
