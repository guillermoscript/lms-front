# Multi-tenancy, JWT, DB query pattern

> Moved verbatim from CLAUDE.md (index refactor). Loaded on demand — CLAUDE.md links here.

### Multi-Tenancy

Every request goes through `proxy.ts` (the single middleware file — **not** `middleware.ts`), which:
1. Extracts tenant slug from subdomain (`school.lmsplatform.com` → `"school"`)
2. Resolves tenant ID from `tenants` table
3. Injects `x-tenant-id` header into the response
4. Checks `tenant_users` membership; redirects non-members to `/join-school`
5. Enforces role-based route guards (`/dashboard/student`, `/dashboard/teacher`, `/dashboard/admin`)

In development, pass `x-tenant-slug` header to simulate a subdomain.

```typescript
import { getCurrentTenantId } from '@/lib/supabase/tenant'
const tenantId = await getCurrentTenantId() // reads x-tenant-id header
```

Default tenant ID (single-tenant fallback): `00000000-0000-0000-0000-000000000001`

### JWT Claims

`custom_access_token_hook()` injects into every JWT: `user_role` (global), `tenant_role` (`student`/`teacher`/`admin` in current tenant), `tenant_id`, `is_super_admin`.

```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'
const role = await getUserRole()  // tenant_users row is authoritative; falls back to JWT tenant_role/user_role only if no active membership AND the JWT tenant_id is this tenant
```

After a tenant switch, **always call `supabase.auth.refreshSession()`** to get updated claims.

### Database Query Pattern

RLS is enabled on all tenant-scoped tables, but **filter by `tenant_id` explicitly anyway** — clarity and performance, not just security:

```typescript
const supabase = await createClient()       // @/lib/supabase/server
const tenantId = await getCurrentTenantId()
const { data } = await supabase.from('courses').select('*').eq('tenant_id', tenantId)
```

**Client imports:** server components → `@/lib/supabase/server` · client components → `@/lib/supabase/client` · admin/bypass-RLS → `createAdminClient()` from `@/lib/supabase/admin`.

When using `createAdminClient()` in server actions, manually validate tenant ownership before writes:
```typescript
const { data: resource } = await adminClient.from('products').select('tenant_id').eq('product_id', id).single()
if (resource.tenant_id !== tenantId) throw new Error('Access denied')
```

### Server Actions vs Direct Queries

Use **direct RLS queries** for all reads. Use **server actions** (in `app/actions/`: `admin/`, `teacher/`, `payment-requests.ts`, `join-school.ts`, `onboarding.ts`) only for multi-step mutations (payment processing, enrollment), service-role operations, or external API calls (Stripe, email).

### Routing & i18n

All routes live under `app/[locale]/` (`[locale]` is always `/en/` or `/es/`). Public routes (no auth): `/auth/*`, `/`, `/create-school`, `/creators`, `/join-school`, `/platform-pricing`, `/pricing`, `/courses`, `/verify`, `/oauth/consent`. Role routing after login: `/dashboard/student` · `/dashboard/teacher` · `/dashboard/admin`. `/platform/*` is guarded separately by `checkSuperAdmin()` in `proxy.ts`, independent of tenant role.

### Database Schema Essentials

116 tables. Key groups: multi-tenancy (`tenants`, `tenant_users`, `tenant_settings`, `super_admins`) · users (`profiles` — global, no tenant_id) · content (`courses`, `lessons`, `exercises`, `exams`, `exam_questions`) · progress (`enrollments` — progress only, `lesson_completions`, `exam_submissions`) · commerce (`products`, `plans`, `transactions`, `subscriptions`, `payment_requests`, `entitlements` — course-access source of truth) · revenue (`revenue_splits`, `payouts`, `invoices`) · platform billing (`platform_plans`, `platform_subscriptions`, `platform_payment_requests`) · gamification (10 `gamification_*` tables incl. `gamification_profiles`, `gamification_xp_transactions`, `gamification_achievements`; plus leagues in `league_tiers`/`league_memberships`) · certificates · notifications.

`profiles` and `gamification_levels` are global (no `tenant_id`).

**Key RPCs:**
```typescript
supabase.rpc('enroll_user', { _user_id, _product_id })
supabase.rpc('handle_new_subscription', { _user_id, _plan_id, _transaction_id, _start_date })  // trigger-invoked; writes to entitlements
supabase.rpc('has_course_access', { _user_id, _course_id })  // access check; _course_id is integer — cast ::int from SQL
supabase.rpc('award_xp', { _user_id, _action_type, _xp_amount, _reference_id, _reference_type })  // overload adds _tenant_id
supabase.rpc('submit_exam', { p_exam_id, p_answers })  // only client write path for exam_submissions/exam_answers; p_answers = { [question_id]: answer_text }; idempotent
supabase.rpc('save_exam_feedback', { p_submission_id, p_exam_id, p_student_id, p_answers, p_overall_feedback, p_score, p_question_feedback, p_ai_model, p_processing_time_ms })
supabase.rpc('get_plan_features', { _tenant_id })
```

