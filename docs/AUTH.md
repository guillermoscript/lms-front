# Authentication & Authorization

## 🔐 Overview

The LMS uses Supabase Auth for authentication and role-based access control (RBAC) for authorization. Roles are stored in the database and injected into JWT tokens for efficient authorization checks.

## 🎭 User Roles

### Role Types
- **student** (default) - Can enroll in and complete courses
- **teacher** - Can create and manage courses
- **admin** - Full system access

### Role Assignment
- New users automatically get 'student' role via `handle_new_user()` trigger
- Admins can assign additional roles via `user_roles` table
- Users can have multiple roles (e.g., teacher + admin)

## 🔑 Authentication Flow

### 1. Sign Up

```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    emailRedirectTo: `${location.origin}/auth/confirm`,
  },
})
```

**What Happens**:
1. Supabase creates user in `auth.users`
2. Sends confirmation email
3. `handle_new_user()` trigger fires:
   - Creates profile in `profiles` table
   - Assigns 'student' role in `user_roles` table
4. User clicks email link → redirected to `/auth/confirm`
5. Supabase confirms email → redirects to app

### 2. Login

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password',
})
```

**What Happens**:
1. Supabase validates credentials
2. Creates session (JWT token)
3. `custom_access_token_hook()` injects role into JWT claims
4. Middleware detects role and redirects to appropriate dashboard

### 3. Get Current User

**Client-side**:
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()
```

**Server-side**:
```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
```

### 4. Logout

```typescript
await supabase.auth.signOut()
```

## 🛡️ Authorization

### JWT Claims Structure

When a user logs in, their JWT token includes custom claims:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "user_role": "student", // ← Injected by custom_access_token_hook
  "iat": 1234567890,
  "exp": 1234571490
}
```

### Getting User Role

**Server-side (preferred)**:
```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'

const role = await getUserRole() // 'student' | 'teacher' | 'admin' | null
```

**From Claims (in middleware)**:
```typescript
import { getRoleFromClaims } from '@/lib/supabase/get-user-role'

const { data } = await supabase.auth.getClaims()
const role = getRoleFromClaims(data?.claims) // 'student' | 'teacher' | 'admin'
```

## 🚦 Middleware & Route Protection

### Middleware Flow

```
Request → middleware.ts
  ↓
1. Update Supabase session
  ↓
2. Check if route is public
  ↓
3. If protected: Get user claims
  ↓
4. Extract role from claims
  ↓
5. Check role permissions
  ↓
6. Redirect if unauthorized
  ↓
Response
```

### Protected Routes

```typescript
// middleware.ts

// Student-only routes
if (pathname.startsWith('/dashboard/student') && userRole !== 'student') {
  return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
}

// Teacher routes (teachers + admins)
if (pathname.startsWith('/dashboard/teacher') &&
    userRole !== 'teacher' && userRole !== 'admin') {
  return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
}

// Admin-only routes
if (pathname.startsWith('/dashboard/admin') && userRole !== 'admin') {
  return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
}
```

### Public Routes

These routes don't require authentication:
- `/` (home page)
- `/auth/login`
- `/auth/sign-up`
- `/auth/forgot-password`
- `/auth/confirm`
- `/auth/error`

## 🔒 Row Level Security (RLS)

RLS policies control database access based on the authenticated user's role and ID.

### How RLS Works

```sql
-- Students can only view published courses they're enrolled in
CREATE POLICY "Students view enrolled courses"
ON courses FOR SELECT
USING (
  status = 'published' AND
  id IN (
    SELECT course_id FROM enrollments
    WHERE user_id = auth.uid() AND status = 'active'
  )
);
```

**Key Functions**:
- `auth.uid()` - Returns current user's UUID
- `auth.jwt()` - Returns JWT claims including custom `user_role`

### Checking Role in RLS

```sql
-- Check if user is admin
(
  SELECT user_role FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1
) = 'admin'

-- Or use JWT claim (faster)
(auth.jwt() ->> 'user_role') = 'admin'
```

## 🔄 Password Reset Flow

### 1. Request Reset

```typescript
const { error } = await supabase.auth.resetPasswordForEmail(
  email,
  {
    redirectTo: `${location.origin}/auth/update-password`,
  }
)
```

### 2. User Clicks Email Link

- Redirected to `/auth/update-password`
- URL contains reset token

### 3. Update Password

```typescript
const { error } = await supabase.auth.updateUser({
  password: newPassword,
})
```

## 🎯 Common Auth Patterns

### Protect a Server Component

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

### Protect an API Route

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // API logic...
}
```

### Role-Based Access in Component

```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'

export default async function Dashboard() {
  const role = await getUserRole()

  return (
    <div>
      {role === 'admin' && <AdminPanel />}
      {role === 'teacher' && <TeacherTools />}
      {role === 'student' && <StudentView />}
    </div>
  )
}
```

## 🐛 Troubleshooting

### "User not authenticated" Error

**Causes**:
- Session expired
- User logged out in another tab
- Invalid/corrupted cookies

**Solutions**:
```typescript
// Refresh session
const { data: { session }, error } = await supabase.auth.refreshSession()

// If still fails, redirect to login
if (!session) {
  window.location.href = '/auth/login'
}
```

### Role Not in JWT Claims

**Cause**: `custom_access_token_hook()` not working or user has no role

**Check**:
```sql
-- Verify user has role
SELECT * FROM user_roles WHERE user_id = 'user-uuid';

-- Verify hook is installed
SELECT * FROM pg_proc WHERE proname = 'custom_access_token_hook';
```

**Fix**:
```sql
-- Assign role manually if missing
INSERT INTO user_roles (user_id, role)
VALUES ('user-uuid', 'student')
ON CONFLICT (user_id, role) DO NOTHING;
```

### Infinite Redirect Loop

**Cause**: Middleware redirecting to a route that also triggers middleware

**Check**:
- Ensure public routes are properly excluded in middleware
- Verify role detection logic is correct
- Check for typos in route paths

**Debug**:
```typescript
// Add logging to middleware
console.log('Path:', pathname)
console.log('User role:', userRole)
console.log('Is public:', isPublicRoute)
```

### RLS Policy Not Working

**Causes**:
- RLS not enabled on table
- Policy syntax error
- Using service role key (bypasses RLS)

**Check**:
```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'your_table';

-- List policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

## 🔐 Security Best Practices

### DO ✅
- Always use `createClient()` from `@/lib/supabase/client` or `server`
- Store sensitive keys in environment variables
- Enable RLS on all tables
- Use middleware for route protection
- Refresh tokens automatically (Supabase handles this)
- Hash passwords (Supabase handles this)

### DON'T ❌
- Never expose service role key to client
- Never trust client-side role checks for security
- Never store passwords in plain text
- Never bypass RLS unless absolutely necessary
- Never hardcode API keys in code
- Never commit `.env.local` to git

## 📝 Session Management

### Session Duration
- **Access Token**: 1 hour (auto-refreshed)
- **Refresh Token**: 30 days (configurable in Supabase)

### Auto-Refresh
Supabase SDK automatically refreshes tokens when they're about to expire.

### Manual Refresh
```typescript
const { data, error } = await supabase.auth.refreshSession()
```

### Session Events
```typescript
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event) // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
  console.log('Session:', session)
})
```

## 🎓 Email Confirmation

### Enable/Disable in Supabase Dashboard
1. Go to Authentication → Settings
2. Toggle "Enable email confirmations"

### Custom Email Templates
1. Go to Authentication → Email Templates
2. Customize "Confirm signup" template
3. Use `{{ .ConfirmationURL }}` for confirmation link

### Handling Confirmation Callback
```typescript
// app/auth/confirm/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    })

    if (!error) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.redirect(new URL('/auth/error', request.url))
}
```

## 🔗 Related Documentation

- [Database Schema](./DATABASE_SCHEMA.md) - User tables and role structure
- [RLS Policies](./RLS_POLICIES.md) - Detailed RLS policy examples
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md) - Testing auth locally
