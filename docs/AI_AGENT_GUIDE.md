# AI Agent Guide

> **For AI Assistants**: This document provides special instructions and context for AI agents (like Claude, ChatGPT, etc.) working on this codebase.

## 🎯 Project Context

You are working on **LMS V2**, a complete rebuild of a Learning Management System. This is a **greenfield project** starting fresh with modern best practices, not a legacy codebase refactor.

### Key Facts
- **Framework**: Next.js 16 (App Router, React 19)
- **Database**: Supabase (PostgreSQL 15)
- **UI**: Shadcn UI (base-mira theme)
- **Priorities**: Student & Teacher UX > Everything else

### What Makes This Project Special
- **Direct Database Queries via RLS** instead of server actions for CRUD
- **No over-engineering** - build what's needed, not what might be needed
- **UX-first approach** - every feature should be delightful to use
- **Comprehensive documentation** - everything should be understandable

## 📖 Required Reading

Before making changes, you **MUST** read:
1. [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) - Understand goals and architecture
2. [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Know the data model
3. [AUTH.md](./AUTH.md) - Understand authentication flow

## 🎨 Code Style & Patterns

### TypeScript
```typescript
// ✅ GOOD: Use proper types
interface Course {
  id: number
  title: string
  status: 'draft' | 'published' | 'archived'
}

// ❌ BAD: Avoid 'any'
const course: any = ...
```

### Database Queries

```typescript
// ✅ GOOD: Direct query with RLS
const { data } = await supabase
  .from('courses')
  .select('*, lessons(count)')
  .eq('status', 'published')

// ❌ BAD: Server action for simple query
async function getCourses() {
  'use server'
  // ... complex server action for simple query
}
```

### Component Structure

```typescript
// ✅ GOOD: Server component with client children
export default async function CoursePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', params.id)
    .single()

  return <CourseView course={course} />
}

// ❌ BAD: Client component doing server fetching
'use client'
export default function CoursePage() {
  const [course, setCourse] = useState(null)
  useEffect(() => {
    // fetching...
  }, [])
}
```

## 🚫 What NOT to Do

### Over-Engineering
```typescript
// ❌ BAD: Creating abstraction for one use case
class CourseRepository {
  async findById(id: number) { ... }
  async findAll() { ... }
  async create(data: CourseInput) { ... }
  // ... 20 more methods
}

// ✅ GOOD: Direct queries where needed
const { data } = await supabase.from('courses').select('*').eq('id', id).single()
```

### Premature Optimization
```typescript
// ❌ BAD: Complex caching for data that rarely changes
const getCourses = cache(async () => {
  // complex caching logic
  // invalidation strategies
  // etc.
})

// ✅ GOOD: Start simple, optimize if needed
const { data } = await supabase.from('courses').select('*')
```

### Unnecessary Abstractions
```typescript
// ❌ BAD: Helper for simple operation
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US').format(date)
}

// ✅ GOOD: Use directly when needed
{new Intl.DateTimeFormat('en-US').format(date)}
```

## ✅ What TO Do

### Keep It Simple
- Use Supabase direct queries via RLS
- Server components by default, 'use client' only when needed
- Shadcn components for UI (already installed)
- Standard Next.js patterns (no complex state management unless required)

### Follow Existing Patterns
Before creating a new pattern, check if similar functionality exists:

```bash
# Search for similar components
grep -r "createClient" app/

# Find similar queries
grep -r "supabase.from('courses')" app/

# Check for existing utilities
ls lib/
```

### Document As You Go
When adding complex logic:

```typescript
/**
 * Enrolls a user in all courses associated with a product.
 * This is called automatically when a payment succeeds.
 *
 * @param userId - The user's UUID
 * @param productId - The product they purchased
 */
async function enrollUserInProduct(userId: string, productId: number) {
  // ...
}
```

## 🔧 Common Tasks

### Adding a New Page

1. **Determine if it needs auth**:
   ```typescript
   // Protected page
   export default async function Page() {
     const supabase = await createClient()
     const { data: { user } } = await supabase.auth.getUser()

     if (!user) redirect('/auth/login')

     // ...
   }
   ```

2. **Fetch data server-side**:
   ```typescript
   const { data } = await supabase
     .from('table_name')
     .select('*')
     .eq('some_field', value)
   ```

3. **Use Shadcn components**:
   ```typescript
   import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
   import { Button } from '@/components/ui/button'
   ```

### Adding a Database Function Call

```typescript
// Call existing database function
const { data, error } = await supabase.rpc('function_name', {
  param1: value1,
  param2: value2,
})

if (error) {
  console.error('Function error:', error)
  // Handle error
}
```

### Creating a Form

1. **Use Shadcn form components**:
   ```bash
   npx shadcn@latest add form
   ```

2. **Implement with React Hook Form**:
   ```typescript
   'use client'

   import { useForm } from 'react-hook-form'
   import { Button } from '@/components/ui/button'
   import { Input } from '@/components/ui/input'

   export function MyForm() {
     const form = useForm()

     async function onSubmit(data: FormData) {
       // Handle submission
     }

     return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>
   }
   ```

### Adding Role-Based Access

```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'

export default async function Page() {
  const role = await getUserRole()

  if (role !== 'teacher' && role !== 'admin') {
    redirect('/dashboard/student')
  }

  // Teacher/admin only content
}
```

## 🎓 Understanding the Database

### Key Relationships

```
users (auth.users)
  ↓
profiles (auto-created)
  ↓
user_roles (assigned role)
  ↓
enrollments (course access)
  ↓
courses
  ↓
lessons, exercises, exams
```

### Key Functions to Know

1. **`enroll_user(user_id, product_id)`**
   - Enrolls user in courses linked to product
   - Called automatically on successful payment

2. **`create_exam_submission(student_id, exam_id, answers)`**
   - Creates exam submission
   - Returns submission ID

3. **`save_exam_feedback(submission_id, ...)`**
   - Saves AI feedback to exam
   - Updates score and marks as reviewed

### Querying with Relations

```typescript
// Get course with nested lessons
const { data } = await supabase
  .from('courses')
  .select(`
    *,
    lessons (
      *,
      exercises (*)
    ),
    enrollments (count)
  `)
  .eq('id', courseId)
  .single()
```

## 🐛 Debugging

### Check Auth State
```typescript
const { data: { session } } = await supabase.auth.getSession()
console.log('Session:', session)

const { data: { user } } = await supabase.auth.getUser()
console.log('User:', user)
console.log('User role:', user?.app_metadata?.user_role)
```

### Check Database Query
```typescript
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('id', courseId)

console.log('Data:', data)
console.log('Error:', error) // Will show RLS policy violations
```

### Check RLS Policies
If query returns empty when it shouldn't:
1. Check if user is authenticated: `await supabase.auth.getUser()`
2. Check if RLS is blocking: Look at error message
3. Verify user has required enrollment/role
4. Test with service role key to bypass RLS (temporarily, for debugging only)

## 🤖 AI-Specific Instructions

### When Asked to Add a Feature

1. **Clarify requirements**:
   - Which role is this for? (student/teacher/admin)
   - Is it CRUD or complex business logic?
   - What's the expected UX?

2. **Check existing patterns**:
   - Search codebase for similar features
   - Review DATABASE_SCHEMA.md for related tables
   - Look for existing components to reuse

3. **Implement incrementally**:
   - Start with data fetching (server component)
   - Add UI (Shadcn components)
   - Add interactions (client component if needed)
   - Test manually

4. **Document your changes**:
   - Add comments for complex logic
   - Update relevant docs if adding new patterns
   - Mention trade-offs in your response

### When Asked to Fix a Bug

1. **Understand the issue**:
   - What's the expected behavior?
   - What's actually happening?
   - Any error messages?

2. **Hypothesize causes**:
   - Auth issue? (check session)
   - RLS policy? (check query error)
   - Component state? (check re-renders)
   - Data issue? (check database directly)

3. **Fix and verify**:
   - Make minimal changes
   - Explain why the fix works
   - Suggest how to prevent similar issues

### When Asked "How to..."

1. **Check documentation first**:
   - Is it in DATABASE_SCHEMA.md?
   - Is it in AUTH.md?
   - Is there a similar example in the codebase?

2. **Provide code examples**:
   - Use actual project patterns
   - Show both server and client approaches
   - Explain trade-offs

3. **Link to relevant docs**:
   - Point to specific sections
   - Suggest related reading

## 📚 Reference Quick Links

### Existing Implementation Examples

**Student Dashboard (Phase 5 - Complete)**

The student dashboard is fully implemented and serves as a reference for patterns:

```
app/dashboard/student/
├── page.tsx                    # Main dashboard with course cards
├── courses/[courseId]/
│   ├── page.tsx                # Course overview with lessons list
│   ├── lessons/[lessonId]/
│   │   ├── page.tsx            # Lesson viewer (server component)
│   │   ├── lesson-content.tsx  # Markdown/video rendering (client)
│   │   └── lesson-navigation.tsx # Prev/Next/Complete (client)
│   └── exams/
│       ├── page.tsx            # Exams list
│       ├── [examId]/
│       │   ├── page.tsx        # Take exam entry point
│       │   ├── exam-taker.tsx  # Interactive exam (client)
│       │   └── review/
│       │       └── page.tsx    # Exam results with AI feedback
```

Reusable components:
- `components/student/course-card.tsx` - Course card with progress
- `components/student/lesson-sidebar.tsx` - Lesson navigation sidebar

See [PHASE_5_SUMMARY.md](./PHASE_5_SUMMARY.md) for detailed implementation notes.

### When working on...

**Student features** → Check:
- `app/dashboard/student/` for existing patterns
- DATABASE_SCHEMA.md for `enrollments`, `lesson_completions`
- RLS policies for student data access

**Teacher features** → Check:
- `app/dashboard/teacher/` for existing patterns
- DATABASE_SCHEMA.md for `courses`, `lessons`, `exams`
- AUTH.md for teacher role checks

**Admin features** → Check:
- `app/dashboard/admin/` for existing patterns
- AUTH.md for admin-only access patterns
- DATABASE_SCHEMA.md for user management tables

**Billing & monetization** → Check:
- `docs/MONETIZATION.md` for full architecture reference
- `app/actions/admin/billing.ts` for server actions
- `lib/plans/features.ts` for plan types and `canAccessFeature()`
- `lib/hooks/use-plan-features.ts` for client hook
- `components/shared/feature-gate.tsx` for gating UI
- `lib/currency.ts` for multi-currency support

**Database queries** → Check:
- DATABASE_SCHEMA.md for table structure
- Existing queries in similar components
- RLS policy documentation (when available)

**UI components** → Check:
- `components/ui/` for Shadcn components
- Existing pages for component usage patterns
- Shadcn docs: https://ui.shadcn.com

## ⚠️ Common Gotchas

- **`createAdminClient()`** lives in `@/lib/supabase/admin`, NOT `@/lib/supabase/server`
- **Button component** uses `@base-ui/react` — has NO `asChild` prop. Wrap `<Link>` around `<Button>` instead
- **Stripe API v2025** (`2025-12-15.clover`): `Subscription` and `Invoice` types have breaking changes — cast to `any` when accessing `current_period_start`, `subscription`, etc.
- **`certificates` table** has TWO foreign keys to `profiles` — must use FK hint: `profiles!certificates_user_id_fkey(...)`
- **`profiles` table** has NO `email` column — get emails via `createAdminClient().auth.admin.getUserById()`
- **`product_courses`** can have multiple rows per course — NEVER use `.single()`
- **`crypto.randomUUID()`** fails on HTTP — use `nanoid()` instead

### Feature Gating Pattern

```typescript
// Server-side: check plan features
const { data: planInfo } = await adminClient.rpc('get_plan_features', { _tenant_id: tenantId })
if (!planInfo?.features?.ai_grading) throw new Error('Requires Pro plan')

// Client-side: use hook + gate component
import { usePlanFeatures } from '@/lib/hooks/use-plan-features'
import { FeatureGate } from '@/components/shared/feature-gate'

const { plan, features, limits } = usePlanFeatures()
<FeatureGate feature="ai_grading" plan={plan} features={features}>
  <AIGradingPanel />
</FeatureGate>
```

## 🎯 Success Criteria

Your implementation is good if:
- ✅ It solves the problem simply
- ✅ It follows existing patterns
- ✅ It's well-commented where complex
- ✅ It uses RLS instead of server actions for CRUD
- ✅ It's mobile-responsive
- ✅ It handles errors gracefully
- ✅ It respects user roles and permissions
- ✅ It filters all queries by `tenant_id`
- ✅ It checks plan limits for gated features

Your implementation needs work if:
- ❌ It adds new patterns without justification
- ❌ It over-engineers a simple task
- ❌ It bypasses RLS unnecessarily
- ❌ It doesn't handle loading/error states
- ❌ It's not mobile-responsive
- ❌ It lacks error handling

## 💡 Remember

> "Make it work, make it right, make it fast" - in that order

1. **Start simple**: Get it working with direct queries
2. **Refactor if needed**: Only when patterns become clear
3. **Optimize last**: Only when there's a proven performance issue

Good luck building amazing learning experiences! 🚀
