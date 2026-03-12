# Authentication & Authorization

## Overview

The LMS uses Supabase Auth for authentication and role-based access control (RBAC) for authorization. In the multi-tenant architecture, roles are **per-tenant** — a user can be an admin on one school and a student on another.

## User Roles

### Role Types
- **student** (default) - Can enroll in and complete courses
- **teacher** - Can create and manage courses
- **admin** - Full system access for their tenant/school

### Role Assignment (Multi-Tenant)
- New users automatically get 'student' role via `handle_new_user()` trigger (global `user_roles`)
- **Per-tenant roles** are stored in `tenant_users` table (authoritative source)
- When a user creates a school, they become `admin` of that tenant
- When a user joins a school, they become `student` of that tenant
- JWT claims (`tenant_role`, `user_role`) are injected by `custom_access_token_hook()` but may be stale across tenants

### Role Resolution Priority
1. **`tenant_users` table** (authoritative) — checked by `getUserRole()` and `proxy.ts`
2. **JWT claims** (fallback) — `tenant_role` then `user_role` from token payload
3. **Default** — `'student'` if no role found

```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'
const role = await getUserRole() // Checks tenant_users first, falls back to JWT
```

**Important:** After switching tenants, call `supabase.auth.refreshSession()` to update JWT claims.

### Role Checking Details

**`getUserRole()`** in `lib/supabase/get-user-role.ts`:
- Uses `getUser()` (server-verified, NOT `getSession()`)
- Queries `tenant_users` table first (authoritative source for per-tenant roles)
- Falls back to `user_role` from JWT claims if no `tenant_users` record exists
- Returns `'student'` as default

**`isSuperAdmin()`** queries the `super_admins` table directly via `createAdminClient()` — it does **NOT** trust the `is_super_admin` JWT claim.

## Authentication Flows

### 1. Sign Up (Email/Password)

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
4. User clicks email link -> redirected to `/auth/confirm`
5. Supabase confirms email -> redirects to app

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
3. `custom_access_token_hook()` injects role claims into JWT
4. `proxy.ts` detects role and redirects to appropriate dashboard

### 3. Unified Create-School Flow

The create-school flow (`components/tenant/create-school-flow.tsx`) provides a two-step process with cross-subdomain auth:

**Step 1 — Account Creation:**
- Email/password signup OR Google OAuth
- If user already has an account, they log in instead

**Step 2 — School Creation:**
- User enters school name
- Slug is auto-generated from the name
- On submit, the school (tenant) is created and the user becomes its `admin`

**After creation:**
- User is redirected to the new school's subdomain (`school-slug.platform.com`)
- Cross-subdomain session is maintained via JWT cookies set with `updateSession()` in `lib/supabase/proxy.ts`
- User lands on the onboarding flow

### 4. Invitation System

Admins can invite users to their school via `app/actions/admin/invitations.ts`:

1. Admin sends an email invitation with a role assignment (student, teacher, or admin)
2. Invited user receives email with a link to the school's subdomain
3. User visits the `/join-school` route on the school's subdomain
4. If the user has no account, they sign up first; if they do, they log in
5. Upon joining, a `tenant_users` record is created with the assigned role

### 5. Get Current User

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

### 6. Logout

```typescript
await supabase.auth.signOut()
```

## getUser() vs getSession() — Security Critical

**Always use `getUser()` in server components and server actions** — it makes a server-verified call to Supabase Auth. Never use `getSession()` for auth decisions as it reads unverified JWT from cookies (can be tampered with).

```typescript
// Correct: Server-verified authentication
const { data: { user } } = await supabase.auth.getUser()

// Wrong: Reads unverified JWT from cookies — DO NOT use for auth decisions
const { data: { session } } = await supabase.auth.getSession()
```

**Exception:** `proxy.ts` (middleware) uses `getSession()` for performance since `getUser()` adds latency per request. It compensates by double-checking the `tenant_users` table for role resolution.

## JWT Claims Structure

The `custom_access_token_hook()` database function injects the following custom claims into every JWT:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "user_role": "student",
  "tenant_role": "admin",
  "tenant_id": "tenant-uuid",
  "is_super_admin": false,
  "iat": 1234567890,
  "exp": 1234571490
}
```

| Claim | Description |
|-------|-------------|
| `user_role` | Global role (from `user_roles` table) |
| `tenant_role` | Role within the current tenant: `student`, `teacher`, or `admin` |
| `tenant_id` | Current tenant UUID |
| `is_super_admin` | Whether the user is a platform super admin |

**Note:** JWT claims may be stale after a tenant switch. Always call `supabase.auth.refreshSession()` after switching tenants to get updated claims.

### Getting User Role

**Server-side (preferred)**:
```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'

const role = await getUserRole() // 'student' | 'teacher' | 'admin' | null
```

**From Claims (in proxy.ts)**:
```typescript
import { getRoleFromClaims } from '@/lib/supabase/get-user-role'

const { data } = await supabase.auth.getClaims()
const role = getRoleFromClaims(data?.claims) // 'student' | 'teacher' | 'admin'
```

## Middleware & Route Protection

### proxy.ts — The Only Middleware

`proxy.ts` is the **single middleware file** for the entire application. There is no `middleware.ts`. It handles:

1. Tenant resolution (subdomain -> tenant ID)
2. Session management (cross-subdomain cookie support)
3. i18n locale detection
4. Auth checks and role-based route guards
5. Tenant membership verification

### Middleware Flow

```
Request -> proxy.ts
  |
1. Extract tenant slug from subdomain
  |
2. Resolve tenant ID from `tenants` table
  |
3. Inject `x-tenant-id` header into response
  |
4. Update Supabase session (cross-subdomain cookies)
  |
5. Check if route is public -> allow through
  |
6. Check authentication -> redirect to /auth/login if not authenticated
  |
7. Check tenant_users membership -> redirect to /join-school if not a member
  |
8. Check role-based route guards -> redirect if unauthorized
  |
Response
```

### Role-Based Route Guards in proxy.ts

```
/dashboard/student  -> requires role === 'student'
/dashboard/teacher  -> requires role === 'teacher' OR role === 'admin'
/dashboard/admin    -> requires role === 'admin'
/platform/*         -> requires membership in `super_admins` table
```

If a user accesses a dashboard route they are not authorized for, `proxy.ts` redirects them to their correct dashboard based on their role.

### Tenant Membership

- `proxy.ts` checks the `tenant_users` table for active membership on every protected request
- Non-members are redirected to `/join-school`
- After a tenant switch, the client must call `supabase.auth.refreshSession()` to update JWT claims with the new tenant context

### Cross-Subdomain Session

JWT cookies are set with cross-subdomain support via `updateSession()` in `lib/supabase/proxy.ts`. This allows users to stay authenticated when navigating between:
- The main platform domain (e.g., `lmsplatform.com`)
- School subdomains (e.g., `school-slug.lmsplatform.com`)

### Public Routes

These routes do not require authentication:

| Route | Description |
|-------|-------------|
| `/auth/*` | All auth pages: `login`, `sign-up`, `sign-up-success`, `forgot-password`, `update-password`, `confirm`, `error`, `callback` |
| `/` | Homepage |
| `/create-school` | School creation flow |
| `/creators` | Creators landing page |
| `/join-school` | Join a school via invitation or open enrollment |
| `/platform-pricing` | Platform pricing page |
| `/pricing` | School pricing page |
| `/courses` | Public course catalog |
| `/verify` | Certificate verification |

## Row Level Security (RLS)

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

## Password Reset Flow

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

## Common Auth Patterns

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

## Troubleshooting

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

**Cause**: `proxy.ts` redirecting to a route that also triggers a redirect

**Check**:
- Ensure public routes are properly excluded in `proxy.ts`
- Verify role detection logic is correct
- Check for typos in route paths

**Debug**:
```typescript
// Add logging to proxy.ts
console.log('Path:', pathname)
console.log('User role:', userRole)
console.log('Is public:', isPublicRoute)
```

### Stale JWT Claims After Tenant Switch

**Cause**: JWT claims still contain the previous tenant's role and ID

**Fix**: Always call `supabase.auth.refreshSession()` after switching tenants to get updated claims from `custom_access_token_hook()`.

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

## Security Best Practices

### DO
- Always use `createClient()` from `@/lib/supabase/client` or `server`
- Store sensitive keys in environment variables
- Enable RLS on all tables
- Use `proxy.ts` for route protection
- Use `getUser()` (not `getSession()`) for auth decisions in server code
- Refresh tokens automatically (Supabase handles this)
- Hash passwords (Supabase handles this)
- Call `refreshSession()` after tenant switches

### DON'T
- Never expose service role key to client
- Never trust client-side role checks for security
- Never trust JWT `is_super_admin` claim — use `isSuperAdmin()` which queries `super_admins` table
- Never store passwords in plain text
- Never bypass RLS unless absolutely necessary
- Never hardcode API keys in code
- Never commit `.env.local` to git
- Never create a `middleware.ts` file (conflicts with `proxy.ts`)

## Session Management

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

## Email Confirmation

### Enable/Disable in Supabase Dashboard
1. Go to Authentication -> Settings
2. Toggle "Enable email confirmations"

### Custom Email Templates
1. Go to Authentication -> Email Templates
2. Customize "Confirm signup" template
3. Use `{{ .ConfirmationURL }}` for confirmation link

### Handling Confirmation Callback

`app/[locale]/auth/confirm/route.ts` handles email OTP verification. For `type=signup` it applies **context-aware smart redirect logic**:

```
Has active tenant_users memberships?
  -> YES -> /dashboard/student          (returning user clicked old link)
  -> NO, main platform (default tenant) -> /create-school
  -> NO, school subdomain -> /join-school
```

For all other OTP types (`recovery`, `magiclink`, etc.) the route uses the `next` query param as before.

```typescript
// Simplified — see route.ts for full implementation
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

if (type === 'signup' && user) {
  const { data: memberships } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)

  if ((memberships ?? []).length > 0) redirect('/dashboard/student')
  else if (tenantId === DEFAULT_TENANT_ID) redirect('/create-school')
  else redirect('/join-school')
}
redirect(next) // recovery, magiclink, etc.
```

**Why this matters:** New users signing up at `school.lvh.me` land on `/join-school` for that school; new users signing up at the main domain land on `/create-school`. No more floating, school-less accounts.

## Related Documentation

- [Database Schema](./DATABASE_SCHEMA.md) - User tables and role structure
- [RLS Policies](./RLS_POLICIES.md) - Detailed RLS policy examples
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md) - Testing auth locally
