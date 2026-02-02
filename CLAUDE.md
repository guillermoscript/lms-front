# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LMS V2 is a modern Learning Management System built with Next.js 16 and Supabase. This is a complete rebuild prioritizing exceptional UX for students and teachers. The project uses **Row Level Security (RLS) for direct database queries** instead of server actions for CRUD operations.

**Key Technologies:**
- Next.js 16.1.5 (App Router, React 19)
- Supabase (PostgreSQL 15, Auth, Storage)
- Shadcn UI (base-mira theme)
- Tailwind CSS v4
- TypeScript (strict mode)
- Stripe for payments

## Commands

### Development
```bash
npm run dev          # Start development server at http://localhost:3000
npm run build        # Build for production (checks TypeScript/lint errors)
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Database (Supabase)
```bash
supabase db pull     # Pull schema from cloud
supabase db push     # Push migrations to cloud
supabase migration new <name>  # Create new migration file
```

**Important**: Database migrations are in `supabase/migrations/`. The database has 44 tables with comprehensive RLS policies.

## Available Skills

This project has custom Claude Code skills available in `skills/`:

### `/web-design-guidelines`
Review UI code for Web Interface Guidelines compliance. Use this skill when:
- Reviewing UI implementations
- Checking accessibility compliance
- Auditing design patterns
- Ensuring best practices for web interfaces

**Usage:**
```bash
/web-design-guidelines app/dashboard/student/page.tsx
/web-design-guidelines "app/dashboard/**/*.tsx"
```

This skill fetches the latest Web Interface Guidelines and validates code against them, reporting findings in `file:line` format.

## Architecture & Key Patterns

### 1. Database Queries via RLS (Core Pattern)

**DO THIS** - Direct queries with RLS protection:
```typescript
// Server component
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data } = await supabase
  .from('courses')
  .select('*, lessons(count)')
  .eq('id', courseId)
  .single()
```

**AVOID THIS** - Server actions for simple CRUD:
```typescript
// ❌ Don't create server actions for basic queries
async function getCourse(id: number) {
  'use server'
  // ... server action for simple query
}
```

**When to use server actions:**
- Complex multi-step operations (e.g., payment processing)
- Operations requiring service role permissions
- External API interactions
- Business logic that shouldn't be exposed to client

### 2. Authentication & Authorization

**JWT Claims**: User roles are injected into JWT via `custom_access_token_hook()` database function.

**Getting user role:**
```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'

const role = await getUserRole() // 'student' | 'teacher' | 'admin' | null
```

**Roles:**
- `student` (default) - Can enroll in and complete courses
- `teacher` - Can create and manage courses
- `admin` - Full system access

**Route protection**: Middleware handles role-based routing. Protected routes redirect based on user role:
- `/dashboard/student` - Students only
- `/dashboard/teacher` - Teachers and admins
- `/dashboard/admin` - Admins only

### 3. Component Structure

**Prefer server components:**
```typescript
// ✅ Server component fetches data
export default async function CoursePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', params.id)
    .single()

  return <CourseView course={course} />
}
```

**Use client components only when needed:**
- Interactive features (forms, buttons with state)
- Browser APIs (localStorage, window)
- React hooks (useState, useEffect)

Mark client components with `'use client'` directive.

### 4. File Structure

```
app/
├── auth/                      # Auth pages (login, signup, etc.)
├── dashboard/
│   ├── student/              # Student dashboard & features
│   ├── teacher/              # Teacher dashboard & features
│   └── admin/                # Admin dashboard
├── api/
│   └── stripe/               # Stripe webhooks & payment APIs
└── layout.tsx

components/
├── ui/                       # Shadcn components (auto-generated)
├── student/                  # Student-specific components
└── teacher/                  # Teacher-specific components

lib/
├── supabase/
│   ├── client.ts            # Client-side Supabase client
│   ├── server.ts            # Server-side Supabase client
│   ├── get-user-role.ts     # Role detection utilities
│   └── middleware.ts        # Session management for middleware
├── stripe.ts                # Stripe client
└── utils.ts                 # Utilities (cn helper, etc.)

docs/                        # Comprehensive documentation
├── PROJECT_OVERVIEW.md      # Architecture & goals
├── DATABASE_SCHEMA.md       # Complete schema reference
├── AUTH.md                  # Authentication flows
└── AI_AGENT_GUIDE.md        # AI-specific development patterns
```

## Database Schema Essentials

### Core Tables

**Users & Roles:**
- `profiles` - User profiles (auto-created on signup)
- `user_roles` - Role assignments (many-to-many)

**Content:**
- `courses` - Course catalog
- `lessons` - Course lessons (MDX content)
- `exercises` - Practice exercises
- `exams` - Assessments with questions
- `exam_questions` - Individual questions
- `question_options` - Multiple choice options

**Progress Tracking:**
- `enrollments` - Course access
- `lesson_completions` - Lesson progress
- `exam_submissions` - Exam attempts with AI feedback

**Commerce:**
- `products` - Individual course products
- `plans` - Subscription plans
- `transactions` - Payment records
- `subscriptions` - Active subscriptions

### Key Database Functions

**Must know:**
```typescript
// Enroll user in courses linked to product
await supabase.rpc('enroll_user', {
  _user_id: userId,
  _product_id: productId
})

// Create exam submission
await supabase.rpc('create_exam_submission', {
  student_id: userId,
  exam_id: examId,
  answers: { "1": "answer text", "2": "option_id" }
})

// Save AI feedback for exam
await supabase.rpc('save_exam_feedback', {
  submission_id: submissionId,
  exam_id: examId,
  student_id: userId,
  answers: answersJson,
  overall_feedback: feedbackText,
  score: scoreNumber
})
```

**Triggers:**
- `handle_new_user()` - Auto-creates profile and assigns 'student' role on signup
- `trigger_manage_transactions()` - Auto-processes successful payments

### Common Query Patterns

**Course with nested data:**
```typescript
const { data } = await supabase
  .from('courses')
  .select(`
    *,
    lessons (
      *,
      lesson_completions (completed_at)
    ),
    enrollments (enrolled_at)
  `)
  .eq('id', courseId)
  .eq('lessons.lesson_completions.student_id', userId)
  .order('sequence', { foreignTable: 'lessons' })
  .single()
```

**Student's enrolled courses:**
```typescript
const { data } = await supabase
  .from('enrollments')
  .select(`
    *,
    course:courses (
      *,
      lessons (count)
    )
  `)
  .eq('user_id', userId)
  .eq('status', 'active')
```

## Development Guidelines

### Code Style

**TypeScript:**
- Use strict mode (already configured)
- Avoid `any` type - use proper interfaces
- Path alias `@/*` maps to root directory

**Component patterns:**
```typescript
// ✅ Proper typing
interface CourseCardProps {
  course: {
    id: number
    title: string
    status: 'draft' | 'published' | 'archived'
  }
}

// ✅ Server component by default
export default async function Page() { ... }

// ✅ Client component when needed
'use client'
export function InteractiveForm() { ... }
```

**Styling:**
- Use Tailwind utility classes
- Use `cn()` helper for conditional classes
- Avoid inline styles
- Use Shadcn components: `npx shadcn@latest add [component]`

### Error Handling

Always handle loading, error, and empty states:

```typescript
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('id', courseId)
  .single()

if (error || !data) {
  redirect('/dashboard/student')
}

// Safe to use data
return <CourseView course={data} />
```

### Don't Over-Engineer

**Keep it simple:**
- Build what's needed, not what might be needed
- Use direct queries instead of abstractions
- Don't create helpers for one-time operations
- No premature optimization

**Example of what NOT to do:**
```typescript
// ❌ Don't create complex abstractions
class CourseRepository {
  async findById(id: number) { ... }
  async findAll() { ... }
  // ... 20 more methods
}

// ✅ Instead, use direct queries where needed
const { data } = await supabase.from('courses').select('*').eq('id', id).single()
```

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=your-stripe-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

**Security:** Never commit `.env.local`. Service role key bypasses RLS - use only for admin operations.

## Current Phase & Status

**Phase 6 (In Progress)**: Teacher Dashboard
- ✅ Course creation and management
- ✅ Lesson editor (MDX)
- ✅ Exam builder
- ⏳ Student submission review (pending)

**Completed:**
- Phase 1: Fresh Next.js 16 + Shadcn UI
- Phase 2: Complete database schema (44 tables)
- Phase 3: Authentication with role-based routing
- Phase 4: Stripe payment integration
- Phase 5: Student Dashboard (lessons, exams, progress tracking)

**Reference implementations:**
- Student dashboard: `app/dashboard/student/` (complete, use as pattern reference)
- Teacher features: `app/dashboard/teacher/` (in progress)
- Components: `components/student/` and `components/teacher/`

## Key Documentation Files

Before making changes, read:
1. `docs/PROJECT_OVERVIEW.md` - Architecture and design principles
2. `docs/DATABASE_SCHEMA.md` - Complete schema with relationships
3. `docs/AUTH.md` - Authentication and authorization flows
4. `docs/AI_AGENT_GUIDE.md` - Detailed patterns and examples
5. `docs/DEVELOPMENT_WORKFLOW.md` - Step-by-step development process

## Common Pitfalls to Avoid

1. **Don't bypass RLS** unless absolutely necessary (admin operations only)
2. **Don't use server actions** for simple CRUD - use RLS-protected direct queries
3. **Don't create new patterns** without checking existing implementations first
4. **Always authenticate server components** that access protected data
5. **Use `createClient()` correctly**:
   - `@/lib/supabase/server` for server components/routes
   - `@/lib/supabase/client` for client components
6. **Handle auth redirects properly** - check user exists before accessing protected data

## Testing Checklist

Before committing:
- [ ] `npm run build` succeeds (no TypeScript errors)
- [ ] Feature works as expected (manual test)
- [ ] Loading states implemented
- [ ] Error states handled
- [ ] Mobile responsive
- [ ] No console errors
- [ ] RLS policies allow correct access
- [ ] Tested with appropriate user role(s)

## Git Workflow

Current branch: `v2-rebuild`
Main branch: `master`

```bash
# Commit format
git commit -m "feat: add course progress tracking

- Add progress calculation
- Create progress component
- Update course card to show progress"

# Push changes
git push origin v2-rebuild
```

## Additional Notes

- **Middleware**: Uses `lib/supabase/middleware.ts` for session management and role-based redirects
- **Payments**: Stripe webhooks at `/api/stripe/webhook` handle successful payments and trigger enrollments
- **AI Integration**: Placeholder for future Gemini 2.0 integration (exam grading, exercise help)
- **TypeScript config**: Uses `@/*` path alias, JSX mode is `react-jsx`, target is ES2017

For detailed examples and patterns, always refer to the comprehensive documentation in the `docs/` directory.
