# Development Workflow

## 🔄 Day-to-Day Development

### Starting Your Day

1. **Pull latest changes**:
   ```bash
   git pull origin v2-rebuild
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

## 📋 Feature Development Process

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

**File structure**:
```
app/dashboard/student/courses/[courseId]/
├── page.tsx          # Main server component
├── loading.tsx       # Loading state (optional)
└── error.tsx         # Error boundary (optional)
```

**Example page.tsx**:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CourseView } from './CourseView'

export default async function CoursePage({
  params,
}: {
  params: { courseId: string }
}) {
  const supabase = await createClient()

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch data with RLS
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
    .eq('id', params.courseId)
    .eq('lessons.lesson_completions.student_id', user.id)
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
      // Uncomplete
      await supabase
        .from('lesson_completions')
        .delete()
        .eq('lesson_id', lessonId)
        .eq('student_id', user.id)
    } else {
      // Complete
      await supabase.from('lesson_completions').insert({
        lesson_id: lessonId,
        student_id: user.id,
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
- ✅ Page loads without errors
- ✅ Data displays correctly
- ✅ Loading states work
- ✅ Error states work
- ✅ Interactions work (buttons, forms, etc.)
- ✅ Mobile responsive
- ✅ Role-based access works (test as different roles)

**Test different roles**:
```sql
-- Change your role temporarily
UPDATE user_roles
SET role = 'teacher'
WHERE user_id = auth.uid();

-- Change back
UPDATE user_roles
SET role = 'student'
WHERE user_id = auth.uid();
```

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
git push origin v2-rebuild
```

## 🎨 UI Development Patterns

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
│   └── exam-builder.tsx
└── shared/               # Shared components
    ├── navbar.tsx
    └── footer.tsx
```

### Styling Guidelines

```typescript
// ✅ GOOD: Use Tailwind utility classes
<div className="flex items-center gap-4 p-6 bg-card border border-border rounded-lg">
  <h2 className="text-2xl font-bold">Title</h2>
</div>

// ✅ GOOD: Use cn() for conditional classes
import { cn } from '@/lib/utils'

<div className={cn(
  "p-4 rounded-lg",
  isActive && "bg-primary text-primary-foreground",
  isDisabled && "opacity-50 cursor-not-allowed"
)}>

// ❌ BAD: Inline styles
<div style={{ padding: '24px', backgroundColor: '#fff' }}>
```

## 🗄️ Database Development

### Writing Queries

**Simple queries**:
```typescript
// SELECT
const { data } = await supabase
  .from('courses')
  .select('*')
  .eq('status', 'published')

// INSERT
const { data } = await supabase
  .from('courses')
  .insert({ title: 'New Course', author_id: userId })
  .select()
  .single()

// UPDATE
const { data } = await supabase
  .from('courses')
  .update({ status: 'published' })
  .eq('id', courseId)

// DELETE
const { data } = await supabase
  .from('courses')
  .delete()
  .eq('id', courseId)
```

**Complex queries with joins**:
```typescript
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

### Testing RLS Policies

```typescript
// Test as different users
const { data: studentData } = await supabase
  .from('courses')
  .select('*')

// If RLS is working correctly:
// - Students see only enrolled courses
// - Teachers see only their courses
// - Admins see all courses
```

## 🧪 Testing Strategy

### Manual Testing

1. **Happy Path**:
   - Normal user flow works
   - Data saves correctly
   - UI updates properly

2. **Error Cases**:
   - What if user isn't logged in?
   - What if data doesn't exist?
   - What if query fails?

3. **Edge Cases**:
   - Empty state (no courses, no lessons)
   - Very long text (course titles, descriptions)
   - Special characters in input
   - Concurrent updates

### Testing Checklist

Before committing:
- [ ] Feature works in Chrome
- [ ] Feature works on mobile (responsive)
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Empty states display correctly
- [ ] No console errors
- [ ] No TypeScript errors (`npm run build`)
- [ ] RLS policies allow correct access
- [ ] Unauthorized users can't access

## 🔧 Debugging

### Common Issues & Solutions

**Issue**: "User not authenticated"
```typescript
// Check session
const { data: { session } } = await supabase.auth.getSession()
console.log('Session:', session)

// Refresh if needed
const { data } = await supabase.auth.refreshSession()
```

**Issue**: Query returns empty array
```typescript
// Check RLS policies
const { data, error } = await supabase
  .from('courses')
  .select('*')

console.log('Error:', error) // Will show RLS violations
```

**Issue**: "Cannot read property of undefined"
```typescript
// Always check if data exists
const { data: course } = await supabase
  .from('courses')
  .select('*')
  .eq('id', courseId)
  .single()

if (!course) {
  redirect('/404')
}

// Now safe to use course.title, etc.
```

### Using Browser DevTools

1. **Network tab**: Check Supabase API calls
2. **Console**: Check for errors and logs
3. **React DevTools**: Inspect component state
4. **Application tab**: Check cookies/localStorage

## 📦 Adding Dependencies

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
- Verify it's actively maintained

## 🚀 Deployment Workflow

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
# → Database → Migrations → Run pending migrations
```

### Vercel Deployment

**Automatic** (when pushing to main):
- Vercel detects push
- Runs `npm run build`
- Deploys to production

**Manual**:
```bash
vercel deploy
```

## 📝 Code Review Checklist

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
- [ ] Documentation updated (if needed)

## 🎯 Best Practices

### DO ✅
- Use TypeScript strictly
- Handle loading and error states
- Make components responsive
- Use Shadcn components when available
- Test as different roles
- Write meaningful commit messages
- Keep functions small and focused
- Use descriptive variable names

### DON'T ❌
- Skip error handling
- Use `any` type
- Bypass RLS for convenience
- Commit `.env.local`
- Leave console.logs in production code
- Over-engineer simple features
- Duplicate code without good reason
- Ignore TypeScript errors

## 📚 Resources

- **Next.js Docs**: https://nextjs.org/docs
- **Supabase Docs**: https://supabase.com/docs
- **Shadcn UI**: https://ui.shadcn.com
- **Tailwind CSS**: https://tailwindcss.com
- **Project Docs**: Check `docs/` folder
