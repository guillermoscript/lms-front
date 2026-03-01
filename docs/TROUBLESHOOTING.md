# Troubleshooting Guide

Practical runbook organized by symptom. Each entry follows the format: **Symptom** / Cause / Fix.

---

## 1. Auth & Login Issues

### Redirect loop on login
**Cause:** `proxy.ts` checks `tenant_users` membership. If the user is authenticated but not a member of the current tenant, they get redirected to `/join-school`, which may redirect back to login.
**Fix:** Verify the user has a row in `tenant_users` for the current tenant. Check `proxy.ts` route guards and ensure `/join-school` is in the public routes list.

### JWT claims stale after tenant switch
**Cause:** JWT claims (`tenant_role`, `tenant_id`) are set at token issuance time by `custom_access_token_hook()`. Switching tenants does not automatically refresh them.
**Fix:** Call `supabase.auth.refreshSession()` immediately after any tenant switch.

### getUserRole() returns wrong role
**Cause:** `getUserRole()` checks the `tenant_users` table first, falling back to `user_roles`. If `tenant_users` has an unexpected role (or no row), you get a wrong or missing role.
**Fix:** Query `tenant_users` directly to verify the user's role for the current tenant. Do not rely solely on JWT claims.

### Admin user can't access admin dashboard
**Cause:** The user is missing a row in `user_roles` with `role = 'admin'`, or is missing from `tenant_users` for the current tenant.
**Fix:**
```sql
-- Check role exists
SELECT ur.role, au.email FROM user_roles ur
JOIN auth.users au ON au.id = ur.user_id
WHERE au.email = 'admin@test.com';

-- Add if missing
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'admin@test.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

### New user signup doesn't create profile
**Cause:** The `handle_new_user()` trigger on `auth.users` auto-creates `profiles` and `user_roles` rows. If users were created via raw SQL (not `auth.signUp()`), the trigger won't fire.
**Fix:** Manually insert rows into `profiles`, `user_roles`, and `auth.identities`. Use `NULL` for `phone` (unique constraint).

---

## 2. Multi-Tenancy Issues

### Sidebar shows "LMS Platform" instead of tenant name
**Cause:** `proxy.ts` must set the `x-tenant-id` header on the **request** so downstream components can read it via `getCurrentTenantId()`.
**Fix:** Verify `proxy.ts` is extracting the subdomain correctly and injecting `x-tenant-id`. In local dev, set `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000` and access via `school.lvh.me:3000`.

### Data from other tenants is visible
**Cause:** A query is missing the `tenant_id` filter. RLS provides a safety net, but explicit filters are required for clarity and performance.
**Fix:** Add `.eq('tenant_id', tenantId)` to every query on tenant-scoped tables. Audit with:
```typescript
const tenantId = await getCurrentTenantId()
const { data } = await supabase.from('courses').select('*').eq('tenant_id', tenantId)
```

### Can't join school (RLS error on INSERT)
**Cause:** Missing RLS INSERT policy on `tenant_users` that allows users to add themselves as students.
**Fix:** Ensure this policy exists:
```sql
CREATE POLICY "Users can join schools as student" ON tenant_users
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND role = 'student' AND status = 'active'
  );
```

### Tenant not resolving from subdomain
**Cause:** The `tenants` table has no row with a matching `slug`, or the slug doesn't match the subdomain.
**Fix:** Check `SELECT slug FROM tenants` and compare against the subdomain being used. In dev, pass `x-tenant-slug` header to simulate a subdomain.

---

## 3. Database / Query Issues

### lesson_completions query returns 0 rows
**Cause:** The column is `user_id`, not `student_id`. Querying by `student_id` silently returns nothing.
**Fix:** Use `.eq('user_id', userId)` on `lesson_completions`.

### product_courses query returns error with .single()
**Cause:** A course can belong to multiple products, so `product_courses` can have multiple rows per course. `.single()` throws when more than one row is returned.
**Fix:** Never use `.single()` on `product_courses`. Use `.select()` and handle the array.

### "Column email does not exist" on profiles
**Cause:** The `profiles` table has no `email` column. Email lives in `auth.users`.
**Fix:** Get email via the admin client:
```typescript
const adminClient = createAdminClient()
const { data } = await adminClient.auth.admin.getUserById(userId)
const email = data.user?.email
```

### createAdminClient import error
**Cause:** Importing from the wrong path.
**Fix:** Import from `@/lib/supabase/admin`, NOT `@/lib/supabase/server`.

### certificates query fails with ambiguous FK
**Cause:** `certificates` has two foreign keys to `profiles` (`user_id` and `revoked_by`). PostgREST can't infer which join to use.
**Fix:** Use the FK hint: `.select('*, profiles!certificates_user_id_fkey(*)')`.

### reviews query returns wrong columns
**Cause:** The `reviews` table uses `entity_type`/`entity_id` (not `course_id`), and `review_text` (not `content`).
**Fix:**
```typescript
.from('reviews')
.select('review_id, entity_id, user_id, rating, review_text, created_at')
.eq('entity_type', 'courses')
.eq('entity_id', courseId)
```

### lesson_completions INSERT blocked by RLS
**Cause:** Missing RLS INSERT policy for authenticated users.
**Fix:** Ensure this policy exists:
```sql
CREATE POLICY "Students can mark lessons complete" ON lesson_completions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
```

### gamification_store_items column error (42703)
**Cause:** The table uses `name` (not `title`) and `is_available` (not `is_active`).
**Fix:** Update queries to use the correct column names: `name` and `is_available`.

---

## 4. UI Component Issues

### Button asChild prop not working
**Cause:** The project uses `@base-ui/react` Button, which does not have an `asChild` prop (unlike Radix).
**Fix:** Wrap `<Link>` around `<Button>` instead:
```tsx
<Link href="/path"><Button>Click me</Button></Link>
```

### Select onValueChange crashes with null
**Cause:** Base-ui Select can pass `null` to `onValueChange` when deselecting.
**Fix:** Add a null guard: `onValueChange={(v) => v && handler(v)}`.

### Accordion type/collapsible prop error
**Cause:** Base-ui Accordion does not accept `type` or `collapsible` props.
**Fix:** Use plain `<Accordion className="...">` with `<AccordionItem value={String(idx)}>`.

### DropdownMenuTrigger asChild not working
**Cause:** Same base-ui issue. Use the `render` prop pattern instead.
**Fix:** `<DropdownMenuTrigger render={<Button>...</Button>} />`.

### BreadcrumbLink not rendering as Link
**Cause:** Base-ui uses `render` prop, not `asChild`.
**Fix:** `<BreadcrumbLink render={<Link href="..." />}>text</BreadcrumbLink>`.

### crypto.randomUUID() fails in BlockEditor
**Cause:** `crypto.randomUUID()` is only available in secure contexts (HTTPS). Local dev on HTTP will fail.
**Fix:** Use `nanoid()` instead. This is a dependency-level issue in BlockEditor files.

---

## 5. Build & Deployment Issues

### Docker build fails on canvas/sharp native dependencies
**Cause:** Native modules like `canvas` require system libraries that aren't present in Alpine by default.
**Fix:** Add to the `deps` stage in `Dockerfile`:
```dockerfile
RUN apk add --no-cache libc6-compat python3 make g++ pkgconfig \
    cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev
```
And to the `runner` stage (runtime libs only):
```dockerfile
RUN apk add --no-cache cairo pango libjpeg-turbo giflib librsvg pixman
```

### Build fails with missing environment variables
**Cause:** `NEXT_PUBLIC_*` variables are inlined at build time by Next.js. They must be available during `npm run build`.
**Fix:** Pass them as Docker build args:
```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://... \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=... \
  --build-arg NEXT_PUBLIC_PLATFORM_DOMAIN=... \
  --build-arg NEXT_PUBLIC_APP_URL=... \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=... \
  .
```

### Standalone output missing (.next/standalone not found)
**Cause:** Next.js standalone output must be explicitly enabled.
**Fix:** Ensure `next.config.ts` includes `output: 'standalone'`.

### Middleware conflict / proxy.ts not running
**Cause:** Both `proxy.ts` and `middleware.ts` exist, causing conflicts. `proxy.ts` is the only middleware file.
**Fix:** Delete `middleware.ts` if it exists. Only `proxy.ts` should handle middleware logic.

---

## 6. Payment Issues

### Transaction status check fails
**Cause:** The status value is `'successful'`, not `'succeeded'` (common Stripe terminology mismatch).
**Fix:** Use `.eq('status', 'successful')` in all transaction queries.

### Enrollment not created after payment
**Cause:** The `enroll_user()` RPC may have failed silently, or it was setting `status = NULL` instead of `'active'`.
**Fix:** Verify the `enroll_user()` RPC sets `status = 'active'` and inherits `tenant_id` from the product. Check migration `fix_enroll_user_rpc_status_and_tenant` is applied.

### Duplicate transaction error on retry
**Cause:** A partial unique index exists on `(user_id, product_id, plan_id) WHERE status IN ('pending', 'successful')`. A pending or successful transaction blocks retries.
**Fix:** Cancel or archive the existing pending transaction before retrying, or handle the unique constraint error gracefully.

### Stripe webhook not processing
**Cause:** There are two separate webhooks with different secrets. Using the wrong secret causes signature verification to fail.
**Fix:**
| Webhook | Route | Env var |
|---------|-------|---------|
| Student payments (Connect) | `/api/stripe/webhook` | `STRIPE_WEBHOOK_SECRET` |
| School billing (Platform) | `/api/stripe/platform-webhook` | `STRIPE_PLATFORM_WEBHOOK_SECRET` |

### Enrollment CHECK constraint violation
**Cause:** Enrollments require either `product_id` OR `subscription_id` — not both, not neither.
**Fix:** Ensure exactly one of `product_id` or `subscription_id` is set when creating an enrollment.

---

## 7. Testing Issues

### E2E tests fail with page.goto timeout
**Cause:** Running tests with multiple parallel workers overloads the dev server. These are not actual bugs.
**Fix:** Run the failing test individually: `npx playwright test -g "test name"`. Or reduce workers: `--workers=1`.

### Multi-tenant tests fail locally
**Cause:** Subdomain routing requires `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000` and access via `http://school.lvh.me:3000`.
**Fix:** Set `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me:3000` in `.env.local` and use `lvh.me` (which resolves to 127.0.0.1) for local testing.

### Test user can't log in
**Cause:** Users created via raw SQL don't trigger `handle_new_user()`, so `profiles` and `user_roles` rows may be missing.
**Fix:** Manually insert into `profiles`, `user_roles`, and `auth.identities`. See the seed file for examples.

### isSuperAdmin() returns false unexpectedly
**Cause:** `isSuperAdmin()` queries the `super_admins` table directly via admin client. It does NOT trust JWT claims.
**Fix:** Verify the user has a row in `super_admins`:
```sql
SELECT * FROM super_admins WHERE user_id = '<user-uuid>';
```

---

## Quick Reference: Common Column Name Mistakes

| Table | Wrong | Correct |
|-------|-------|---------|
| `lesson_completions` | `student_id` | `user_id` |
| `exam_submissions` | `submitted_at` | `submission_date` |
| `exam_submissions` | `user_id` | `student_id` |
| `transactions` | `'succeeded'` | `'successful'` |
| `reviews` | `content` | `review_text` |
| `reviews` | `course_id` | `entity_id` (+ `entity_type = 'courses'`) |
| `gamification_store_items` | `title` | `name` |
| `gamification_store_items` | `is_active` | `is_available` |
| `profiles` | `email` | _(does not exist — use `auth.users`)_ |
| `courses` | `slug` | _(does not exist — use `course_id`)_ |

---

## Quick Reference: Import Paths

| Need | Correct Import |
|------|---------------|
| Server component Supabase client | `createClient()` from `@/lib/supabase/server` |
| Client component Supabase client | `createClient()` from `@/lib/supabase/client` |
| Admin client (bypass RLS) | `createAdminClient()` from `@/lib/supabase/admin` |
| Tenant context | `getCurrentTenantId()` from `@/lib/supabase/tenant` |
| User role | `getUserRole()` from `@/lib/supabase/get-user-role` |
| Plan features (hook) | `usePlanFeatures()` from `@/lib/hooks/use-plan-features` |

---

**Last updated:** March 1, 2026
