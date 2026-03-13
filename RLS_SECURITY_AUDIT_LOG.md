# RLS Security Audit — Captain's Log

**Started:** 2026-03-13
**Status:** COMPLETE — All 38 tables secured

## Summary

38 out of 92 public tables had NO RLS enabled. Both `anon` and `authenticated` roles had full CRUD + TRUNCATE on all of them. This is a critical multi-tenant data leak.

### Tables requiring RLS (have `tenant_id`, no RLS) — 12 CRITICAL
| # | Table | Batch | Status | Notes |
|---|-------|-------|--------|-------|
| 1 | `transactions` | 1 | ✅ Done | Payment data — highest priority |
| 2 | `courses` | 2 | ✅ Done | |
| 3 | `enrollments` | 2 | ✅ Done | |
| 4 | `products` | 3 | ✅ Done | |
| 5 | `subscriptions` | 3 | ✅ Done | |
| 6 | `plans` | 3 | ✅ Done | |
| 7 | `exams` | 4 | ✅ Done | |
| 8 | `exam_submissions` | 4 | ✅ Done | |
| 9 | `exercises` | 5 | ✅ Done | |
| 10 | `lessons` | 5 | ✅ Done | |
| 11 | `product_courses` | 6 | ✅ Done | |
| 12 | `course_categories` | 6 | ✅ Done | |

### Tables requiring RLS (no `tenant_id`, need user-scoped or FK-based) — 26 HIGH
| # | Table | Batch | Status | Notes |
|---|-------|-------|--------|-------|
| 1 | `grades` | 12 | ✅ Done | user_id scoped |
| 2 | `exam_answers` | 7 | ✅ Done | |
| 3 | `exam_questions` | 7 | ✅ Done | |
| 4 | `exam_scores` | 7 | ✅ Done | student_id scoped |
| 5 | `question_options` | 7 | ✅ Done | |
| 6 | `exercise_code_student_submissions` | 8 | ✅ Done | user_id scoped |
| 7 | `exercise_completions` | 8 | ✅ Done | user_id scoped |
| 8 | `exercise_files` | 8 | ✅ Done | |
| 9 | `exercise_messages` | 8 | ✅ Done | user_id scoped |
| 10 | `lesson_comments` | 9 | ✅ Done | user_id scoped |
| 11 | `lesson_passed` | 9 | ✅ Done | user_id scoped |
| 12 | `lesson_views` | 9 | ✅ Done | user_id scoped |
| 13 | `tickets` | 10 | ✅ Done | user_id scoped |
| 14 | `ticket_messages` | 10 | ✅ Done | user_id scoped |
| 15 | `submissions` | 10 | ✅ Done | student_id scoped |
| 16 | `messages` | 11 | ✅ Done | |
| 17 | `chats` | 11 | ✅ Done | user_id scoped |
| 18 | `comment_flags` | 11 | ✅ Done | user_id scoped |
| 19 | `comment_reactions` | 11 | ✅ Done | user_id scoped |
| 20 | `assignments` | 12 | ✅ Done | |
| 21 | `roles` | 12 | ✅ Done | Lookup — SELECT only |
| 22 | `permissions` | 12 | ✅ Done | Lookup — SELECT only |
| 23 | `role_permissions` | 12 | ✅ Done | Lookup — SELECT only |
| 24 | `landing_page_templates` | 12 | ✅ Done | Super admin managed |
| 25 | `plan_courses` | 12 | ✅ Done | Public read |
| 26 | `exam_views` | 7 | ✅ Done | user_id scoped |

---

## Batch Log

### Batch 1 — `transactions` (2026-03-13)

**Migration:** `rls_transactions`

**Policies added:**
- SELECT: Students see own transactions in tenant
- SELECT: Teachers/admins see all transactions in tenant
- SELECT: Super admins see all
- INSERT: Authenticated users can create own transactions in tenant
- UPDATE: Authenticated users can update own transactions in tenant (for stripe_payment_intent_id)
- TRUNCATE revoked from anon + authenticated

**Files that query `transactions`:**
- `app/[locale]/dashboard/admin/transactions/page.tsx` — SELECT, admin, server client
- `app/[locale]/dashboard/admin/page.tsx` — SELECT count, admin, server client
- `app/[locale]/dashboard/student/profile/page.tsx` — SELECT, student, server client
- `app/[locale]/dashboard/teacher/revenue/page.tsx` — SELECT, teacher, server client
- `app/[locale]/dashboard/admin/users/[userId]/page.tsx` — SELECT, admin, server client
- `app/api/stripe/webhook/route.ts` — UPDATE, system, service role (bypasses RLS)
- `app/api/stripe/create-payment-intent/route.ts` — INSERT + UPDATE, authenticated, server client
- `app/actions/payment-requests.ts` — INSERT, admin (uses both server + admin client)
- `app/actions/admin/revenue.ts` — SELECT, admin, server client
- `app/[locale]/(public)/checkout/actions.ts` — INSERT, authenticated, server client
- `app/[locale]/platform/tenants/[tenantId]/page.tsx` — SELECT, super admin
- `components/teacher/transaction-list.tsx` — client display component

**Testing:**
- [x] Supabase API: anon cannot SELECT — returns `[]`
- [x] Supabase API: anon cannot INSERT — `permission denied`
- [x] Supabase API: anon cannot DELETE — `permission denied`
- [x] Supabase API: authenticated student sees only own transactions
- [x] Supabase API: authenticated admin sees all tenant transactions
- [x] Supabase API: student cannot INSERT for another user — `violates row-level security`
- [x] Supabase API: student cannot UPDATE another user's transaction — returns `[]`
- [x] Supabase API: service role (webhooks) bypasses RLS correctly
- [ ] Playwright: admin transactions page loads (skipped — subdomain auth routing blocks Playwright browser; not an RLS issue)

**Issues found:**
- None — all API-level security tests passed
- Playwright browser testing deferred: `proxy.ts` subdomain routing redirects unauthenticated Playwright sessions to root domain. This is expected behavior, not an RLS bug. Full E2E test will be done after all batches are complete.

---

### Batch 2 — `courses` + `enrollments` (2026-03-13)

**Migration:** `rls_courses_enrollments`

**Courses policies:** 4 SELECT (anon published, teacher own, admin tenant, super admin), 1 INSERT (teacher/admin), 2 UPDATE (teacher own, admin tenant), 1 DELETE (admin tenant). Anon revoked INSERT/UPDATE/DELETE/TRUNCATE.

**Enrollments policies:** 3 SELECT (student own, teacher/admin tenant, super admin), 1 INSERT (own), 1 UPDATE (admin). Anon revoked all writes.

**Testing:**
- [x] Anon sees only published courses (4 returned, all `status=published`)
- [x] Anon INSERT courses — `permission denied`
- [x] Student sees published courses, cannot INSERT
- [x] Admin sees all tenant courses
- [x] Anon SELECT enrollments — empty
- [x] Anon INSERT enrollments — `permission denied`
- [x] Student sees only own enrollments (2 returned)
- [x] Student INSERT for another user — `violates row-level security`
- [x] Admin sees all tenant enrollments (4 returned)

**Issues found:** None

---

### Batch 3 — `products` + `subscriptions` + `plans` (2026-03-13)

**Migration:** `rls_products_subscriptions_plans`

**Testing:**
- [x] Products: anon sees active only, anon INSERT blocked
- [x] Plans: anon sees non-deleted only, anon INSERT blocked
- [x] Subscriptions: anon empty, student sees own, admin sees tenant

**Issues found:** None

---

### Batch 4 — `exams` + `exam_submissions` (2026-03-13)
Migration: `rls_exams_exam_submissions`. Tenant-scoped SELECT/INSERT/UPDATE. Anon blocked. Tested OK.

### Batch 5 — `exercises` + `lessons` (2026-03-13)
Migration: `rls_exercises_lessons`. Tenant-scoped. Anon blocked. Tested OK.

### Batch 6 — `product_courses` + `course_categories` (2026-03-13)
Migration: `rls_product_courses_course_categories`. Public SELECT for catalog. Admin CRUD. Anon write blocked. Tested OK.

### Batch 7 — Exam child tables (2026-03-13)
Migration: `rls_exam_child_tables`. Tables: exam_questions, question_options, exam_answers, exam_scores, exam_views. User-scoped where applicable. Anon blocked. Tested OK.

### Batch 8 — Exercise child tables (2026-03-13)
Migration: `rls_exercise_child_tables`. Tables: exercise_code_student_submissions, exercise_completions, exercise_files, exercise_messages. User-scoped. Anon blocked. Tested OK.

### Batch 9 — Lesson child tables (2026-03-13)
Migration: `rls_lesson_child_tables`. Tables: lesson_comments, lesson_passed, lesson_views. User-scoped. Anon blocked. Tested OK.

### Batch 10 — Tickets + submissions (2026-03-13)
Migration: `rls_tickets_submissions`. Tables: tickets, ticket_messages, submissions. User-scoped. Anon blocked. Tested OK.

### Batch 11 — Chats + comments (2026-03-13)
Migration: `rls_chats_comments`. Tables: chats, messages, comment_flags, comment_reactions. User-scoped. Anon blocked. Tested OK.

### Batch 12 — Remaining tables (2026-03-13)
Migration: `rls_remaining_tables`. Tables: grades, assignments, plan_courses, roles, permissions, role_permissions, landing_page_templates. Lookup tables = SELECT only. Sensitive tables = user-scoped. Anon write blocked. Tested OK.

---

## Final Verification (2026-03-13)

**Result: 0 tables without RLS.** All 92 public tables now have RLS enabled.

**Final anon security test:** All 38 previously unprotected tables reject anon INSERT with `permission denied` (HTTP 401) or schema validation (HTTP 400). All sensitive tables return 0 rows for anon SELECT.

**Known items for future review:**
- Some policies use `get_tenant_role()` from JWT claims which defaults to `'student'` — works correctly but could be tightened with `tenant_users` checks in the future
- `messages` table had a pre-existing SELECT policy that was unused (RLS was disabled) — now active

---

## Post-Audit Browser Testing (2026-03-13)

Tested all critical flows via Playwright MCP browser:

| Flow | Status | Notes |
|------|--------|-------|
| Student login + dashboard | PASS | Welcome, gamification, sidebar all load |
| Student browse courses | PASS | 2 courses visible, categories work |
| Teacher dashboard | PASS | Stats, courses, checklist all load with data |
| Admin transactions | PASS | Table structure, stats cards |
| Admin courses | PASS | 2 courses with full management table |
| Admin enrollments | PASS | 2 enrollments visible with correct data |
| Admin settings | PASS | All tabs and form fields render |
| Pricing (public) | PASS | Page loads, FAQ section present |
| Platform panel (super admin) | PASS | Overview with all stats |
| Tenant isolation | PASS | Non-member correctly gets join-school redirect |

**No RLS-related breakage found.**

### Issues Found & Fixed

1. **Missing i18n keys for teacher dashboard tour** — 10 MISSING_MESSAGE console errors
   - Keys: `dashboard.teacher.tour.{welcome,stats,courses,sidebarCourses,sidebarCreate}.{title,description}`
   - Fix: Added missing keys to `messages/en.json` and `messages/es.json`

2. **Admin dashboard redirect to /onboarding** — Test users had `onboarding_completed = false`
   - `owner@e2etest.com` and `creator@codeacademy.com` hit the onboarding redirect on admin dashboard
   - Fix: Set `onboarding_completed = true` for admin/teacher test users in DB and updated `supabase/seed.sql`

---
