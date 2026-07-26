# Database Schema Documentation

## Overview

The LMS database is built on PostgreSQL 15 via Supabase. As of the latest migration it has **116 tables** in the `public` schema, organized into logical domains:

- **User Management**: `profiles` (global), `user_roles`, `roles`, `permissions`, `role_permissions`
- **Multi-Tenancy**: `tenants`, `tenant_users`, `tenant_settings`, `tenant_invitations`, `super_admins`, `system_settings`
- **Course Content**: `courses`, `course_categories`, `lessons`, `lesson_resources`, `lesson_checkpoints`, `lesson_checkpoint_attempts`, `exercises`, `exams`, `exam_questions`, `question_options`, `content_versions`, `lessons_ai_tasks`, `lessons_ai_task_messages`, `prompt_templates`
- **Access Control**: **`entitlements`** — the source of truth for course access
- **Progress**: `enrollments` (progress record only), `lesson_completions`, `lesson_passed`, `lesson_views`, `exam_submissions`, `exam_answers`, `exam_scores`, `exam_question_scores`, `exercise_completions`, `exercise_evaluations`
- **Commerce**: `products`, `product_courses`, `product_post_registration_steps`, `plans`, `plan_courses`, `transactions`, `subscriptions`, `payment_requests`, `webhook_events`, `tenant_payment_wallets`
- **Platform Billing**: `platform_plans`, `platform_subscriptions`, `platform_payment_requests`, `access_cutoff_notifications`
- **Revenue**: `revenue_splits`, `payouts`, `invoices`
- **Gamification**: 10 `gamification_*` tables plus leagues (`league_tiers`, `league_memberships`)
- **Adaptive Practice (FSRS/Elo)**: `review_cards`, `practice_attempts`, `student_topic_ratings`, `study_goals`
- **Certificates**: `certificates`, `certificate_templates`, `certificate_shares`, `certificate_verification_log`, `issuer_keys`
- **AI Tutoring**: `course_ai_tutors`, `aristotle_sessions`, `aristotle_messages`, `exam_ai_configs`
- **Landing Pages**: `landing_pages`, `landing_page_templates`
- **Community**: `community_posts`, `community_comments`, `community_reactions`, `community_poll_options`, `community_poll_votes`, `community_flags`, `community_user_mutes`
- **Social / Messaging**: `messages`, `chats`, `chat_conversations`, `chat_messages`, `lesson_comments`, `comments`, `comment_reactions`, `comment_flags`, `reviews`, `item_ratings`
- **Support**: `tickets`, `ticket_messages`
- **Notifications**: `notifications`, `user_notifications`, `notification_templates`, `notification_preferences`, `device_push_tokens`
- **API/MCP**: `mcp_api_tokens`, `mcp_audit_log`
- **Media**: `exercise_media_submissions`, `exercise_files`, `exercise_code_student_submissions`
- **Legacy / unused**: `assignments`, `submissions`, `grades` — present but not wired into current flows

For the exact current list, don't trust this page — ask the database (see [Verifying this document](#verifying-this-document)).

### Conventions & Pitfalls

- **Primary keys use `_id` suffix**: `product_id`, `course_id`, `enrollment_id`, `transaction_id`, `submission_id`, `request_id`, `exam_id`, `question_id`, `option_id`, `score_id`. Exceptions: `lessons`, `exercises` and `lesson_completions` use a bare `id`.
- **Access lives in `entitlements`, not `enrollments`** (since migration `20260516150000`). `enrollments` is a learning-progress record only; its `product_id`/`subscription_id` columns and their CHECK constraint were **dropped**.
- **`profiles` is GLOBAL** — no `tenant_id`. Same for `gamification_levels`, `platform_plans`, `plan_courses`, and ~50 child tables (full list under [Tables without `tenant_id`](#tables-without-tenant_id)). Adding `.eq('tenant_id', …)` to a table that lacks the column **errors the entire query**.
- **`lesson_completions` uses `user_id`** (NOT `student_id`), and has no `tenant_id`.
- **`exercise_completions` uses `user_id`** (NOT `student_id`), and has no `tenant_id`.
- **`exam_submissions` uses `student_id`**, and its order column is `submission_date` (NOT `submitted_at`).
- **Exam child tables have no `tenant_id`**: `exam_questions`, `exam_answers`, `exam_scores`, `exam_question_scores`, `question_options`. Isolation comes from RLS through the parent exam/submission.
- **`exams` has no `passing_score` and no `allow_retake`** — use 70 as the default threshold and assume retakes are allowed.
- **`exam_questions` has no `sequence` column** — questions come back in insertion order.
- **Transaction status is `'successful'`** (NOT `'succeeded'`). Full enum: `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded`
- **`product_courses` can have multiple rows per course** — a single course can belong to many products. **NEVER use `.single()`** on this table.
- **Enrollment status** uses enum `enrollement_status`: `'active'` | `'disabled'` (the typo in the enum name is legacy — keep it)
- **`subscriptions` status column is `subscription_status`**, not `status`; the provider id is `provider_subscription_id`, not `stripe_subscription_id`.
- **`certificates` has TWO FKs to `profiles`** (`user_id`, `revoked_by`) — must use FK hint: `profiles!certificates_user_id_fkey(...)`
- **`profiles` has NO `email` column** — get emails via `createAdminClient().auth.admin.getUserById()`
- **`courses` has no `slug`** — route by `course_id`.
- **`gamification_profiles` has no `coins` column** — balance = `floor(total_xp / 10) - total_coins_spent`.

---

## Core Tables

### Users & Authentication

#### `profiles`
**GLOBAL table** — no `tenant_id` column. Auto-created on signup by `handle_new_user()` trigger.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | References `auth.users(id)` |
| `full_name` | TEXT | |
| `username` | TEXT | |
| `avatar_url` | TEXT | |
| `website` | TEXT | |
| `bio` | TEXT | |
| `currency_id` | | |
| `stripe_customer_id` | TEXT | Student payments (Connect). Note a legacy `stripeCustomerID` column also exists |
| `data_person` | JSONB | |
| `onboarding_completed` | BOOLEAN | |
| `deactivated_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

**No `email` column** and **no `updated_at`**. Emails come from `createAdminClient().auth.admin.getUserById()`.

#### `user_roles`
Assigns global roles to users. Default role `student` assigned on signup.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `user_id` | UUID FK → profiles | |
| `role` | VARCHAR(50) | `student`, `teacher`, `admin` |
| `created_at` | TIMESTAMPTZ | |

`UNIQUE(user_id, role)` — users can have multiple roles.

---

### Multi-Tenancy

#### `tenants`
School/organization records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `slug` | VARCHAR(100) UNIQUE | Used in subdomain routing |
| `name` | VARCHAR(255) | |
| `domain` | VARCHAR(255) | Custom domain |
| `logo_url` | TEXT | |
| `primary_color` | VARCHAR(7) | |
| `secondary_color` | VARCHAR(7) | |
| `plan` | VARCHAR(50) | Legacy — see `platform_subscriptions` |
| `status` | VARCHAR(50) | `active`, etc. |
| `stripe_account_id` | VARCHAR(255) | Stripe Connect (for student payments) |
| `stripe_customer_id` | VARCHAR(255) | Platform billing (school pays platform) |
| `billing_email` | VARCHAR(255) | |
| `billing_period_end` | TIMESTAMPTZ | |
| `billing_status` | VARCHAR(50) | `free`, `active`, `past_due`, `canceled` |
| `access_cutoff_at` | TIMESTAMPTZ | When an unpaid school's content access is suspended |
| `stripe_charges_enabled` / `stripe_payouts_enabled` / `stripe_details_submitted` | BOOLEAN | Stripe Connect onboarding state |

#### `tenant_users`
Many-to-many user-tenant relationships. **Authoritative source for per-tenant roles.**

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `user_id` | UUID FK → auth.users | |
| `role` | VARCHAR(50) | `student`, `teacher`, `admin` |
| `status` | VARCHAR(50) | `active`, etc. |
| `joined_at` | TIMESTAMPTZ | |

`UNIQUE(tenant_id, user_id)`

#### `tenant_settings`
Per-tenant key-value configuration.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `setting_key` | VARCHAR(255) | |
| `setting_value` | JSONB | |

`UNIQUE(tenant_id, setting_key)`

#### `tenant_invitations`
Email invitations to join a school. Checked during `/join-school` flow to auto-assign the invited role.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `email` | TEXT | |
| `role` | TEXT | `student` or `teacher` |
| `invited_by` | UUID FK → auth.users | |
| `status` | TEXT | `pending`, `accepted`, `expired` |
| `created_at` | TIMESTAMPTZ | |
| `accepted_at` | TIMESTAMPTZ | |

`UNIQUE(tenant_id, email, status)`

#### `super_admins`
Platform-level super admin users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → auth.users, UNIQUE | |
| `created_at` | TIMESTAMPTZ | |

---

### Courses

#### `courses`
Course catalog. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `course_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `title` | VARCHAR(255) | |
| `description` | TEXT | |
| `thumbnail_url` | TEXT | |
| `author_id` | UUID FK → profiles | |
| `category_id` | INTEGER FK → course_categories | |
| `status` | VARCHAR(50) | `draft`, `published`, `archived` |
| `require_sequential_completion` | BOOLEAN | Default `false` |
| `learning_objectives` | TEXT[] | **`text[]`, not JSONB** |
| `estimated_duration_minutes` | INTEGER | |
| `tags` | | |
| `published_at` / `archived_at` / `deleted_at` | TIMESTAMPTZ | Soft lifecycle — filter `deleted_at IS NULL` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

No `slug` column — use `course_id` for routing. `author_id` has **two** FKs (`courses_author_id_fkey` → `auth.users`, `courses_author_profile_fkey` → `profiles`), so joins to `profiles` need an explicit FK hint.

#### `course_categories`
Course categorization. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `name` | VARCHAR(100) | |
| `description` | TEXT | |

---

### Lessons

#### `lessons`
Course lessons. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `course_id` | INTEGER FK → courses(course_id) | |
| `title` | VARCHAR(255) | |
| `content` | TEXT | MDX/Markdown |
| `video_url` | TEXT | |
| `sequence` | INTEGER | Order within course |
| `status` | VARCHAR(50) | `draft`, `published` |
| `publish_at` | TIMESTAMPTZ | Scheduled publishing |
| `is_preview` | BOOLEAN | Viewable without access (public preview) |
| `description` / `summary` / `image` | | |
| `embed_code` | TEXT | Alternative to `video_url` |
| `transcript` | TEXT | Video transcript (YouTube captions) |
| `ai_task_description` / `ai_task_instructions` | TEXT | Inline AI task; richer config lives in `lessons_ai_tasks` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

PK is a bare `id`, **not** `lesson_id` — XP triggers joining `lessons` on `l.lesson_id` is a known past bug.

`UNIQUE(course_id, sequence)`

#### `lesson_completions`
Tracking student progress. **Uses `user_id`** (NOT `student_id`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | GENERATED ALWAYS AS IDENTITY |
| `user_id` | UUID FK → profiles | **NOT `student_id`** |
| `lesson_id` | BIGINT FK → lessons | |
| `completed_at` | TIMESTAMPTZ | |

`UNIQUE(user_id, lesson_id)`

#### `lesson_comments`
Hierarchical comments on lessons.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `lesson_id` | INTEGER FK → lessons | |
| `user_id` | UUID FK → profiles | |
| `parent_id` | INTEGER FK → lesson_comments | For replies |
| `content` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `lesson_resources`
File attachments per lesson. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | GENERATED ALWAYS AS IDENTITY |
| `lesson_id` | BIGINT FK → lessons | |
| `tenant_id` | UUID FK → tenants | |
| `file_name` | TEXT | |
| `file_path` | TEXT | |
| `file_size` | BIGINT | |
| `mime_type` | TEXT | |
| `uploaded_by` | UUID FK → auth.users | |
| `display_order` | INT | |
| `created_at` | TIMESTAMPTZ | |

Storage bucket: `lesson-resources` (private, 10MB limit).

---

### Exercises

#### `exercises`
Practice exercises within lessons. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `lesson_id` | INTEGER FK → lessons | |
| `title` | VARCHAR(255) | |
| `description` | TEXT | |
| `exercise_type` | `exercise_type` enum | See values below |
| `exercise_config` | JSONB | Type-specific configuration |
| `instructions` | TEXT | Student-facing prompt |
| `system_prompt` | TEXT | For AI-evaluated exercises |
| `difficulty_level` | `difficulty_level` | `easy`, `medium`, `hard` |
| `time_limit` | INTEGER | |
| `course_id` | INTEGER FK → courses | Denormalized alongside `lesson_id` |
| `active_file` / `visible_files` | | Sandpack code-exercise setup |
| `template_id` / `template_variables` | | Built from a `prompt_templates` row |
| `created_by` | UUID | |
| `status` | VARCHAR(50) | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

There are no `initial_code`, `solution_code` or `test_cases` columns — code-exercise setup lives in `exercise_config` / `active_file` / `visible_files`.

**`exercise_type` enum values:** `quiz`, `coding_challenge`, `essay`, `multiple_choice`, `true_false`, `fill_in_the_blank`, `discussion`, `audio_evaluation`, `video_evaluation`, `real_time_conversation`, `artifact`

#### `exercise_completions`
Records that a student finished an exercise. **Uses `user_id`, and has NO `tenant_id`** — filtering by `tenant_id` errors the query.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `exercise_id` | INTEGER FK → exercises | |
| `user_id` | UUID FK → auth.users | **NOT `student_id`** |
| `completed_by` | UUID | Who marked it complete (self or teacher) |
| `score` | NUMERIC | |
| `completed_at` | TIMESTAMPTZ | |

The submission content and AI feedback live in `exercise_evaluations` / `exercise_code_student_submissions` / `exercise_media_submissions`, not here.

#### `exercise_messages`
AI chat for exercise help.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `exercise_id` | INTEGER FK → exercises | |
| `student_id` | UUID FK → profiles | |
| `role` | VARCHAR(50) | `user` or `assistant` |
| `content` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

#### `exercise_media_submissions`
Audio/video exercise uploads. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | GENERATED ALWAYS AS IDENTITY |
| `exercise_id` | BIGINT FK → exercises | |
| `user_id` | UUID FK → profiles | |
| `tenant_id` | UUID | |
| `media_url` | TEXT | |
| `media_type` | TEXT | `audio` or `video` |
| `duration_seconds` | INTEGER | |
| `status` | TEXT | `pending`, `processing`, `completed`, `failed` |
| `stt_result` | JSONB | Speech-to-text result |
| `ai_evaluation` | JSONB | |
| `score` | NUMERIC(5,2) | |
| `created_at` | TIMESTAMPTZ | |

---

### Exams

#### `exams`
Course assessments. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `exam_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `course_id` | INTEGER FK → courses(course_id) | |
| `title` | VARCHAR(255) | |
| `description` | TEXT | |
| `duration` | INTEGER | Minutes |
| `exam_date` | TIMESTAMPTZ | Nullable |
| `status` | VARCHAR(50) | `draft`, `published` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `exam_questions`
**No `tenant_id`, no `sequence`, no `created_at`.** Filter by `exam_id` only — isolation comes from RLS on the parent exam.

| Column | Type | Notes |
|--------|------|-------|
| `question_id` | SERIAL PK | |
| `exam_id` | INTEGER FK → exams(exam_id) | |
| `question_text` | TEXT | |
| `question_type` | VARCHAR(50) | `multiple_choice`, `true_false`, `free_text` |
| `points` | INTEGER | Default 1 |
| `correct_answer` | TEXT | |
| `ai_grading_criteria` | TEXT | Guidance for AI grading |
| `grading_rubric` | JSONB | |
| `expected_keywords` | TEXT[] | |
| `max_length` | INTEGER | For free-text answers |

Sibling child tables — also **without `tenant_id`**: `question_options`, `exam_answers`, `exam_scores`, `exam_question_scores`.

#### `question_options`
Options for multiple choice/true-false questions.

| Column | Type | Notes |
|--------|------|-------|
| `option_id` | SERIAL PK | |
| `question_id` | INTEGER FK → exam_questions(question_id) | |
| `option_text` | TEXT | |
| `is_correct` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

#### `exam_submissions`
Student exam submissions. **Order column is `submission_date`** (NOT `submitted_at`). Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `submission_id` | INTEGER PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `exam_id` | INTEGER FK → exams(exam_id) | |
| `student_id` | UUID FK → profiles | |
| `submission_date` | TIMESTAMPTZ | **NOT `submitted_at`** |
| `ai_data` | JSONB | AI feedback per question |
| `score` | NUMERIC | |
| `feedback` | TEXT | Overall feedback |
| `evaluated_at` | TIMESTAMPTZ | |
| `review_status` | VARCHAR | **NOT `is_reviewed`** |
| `requires_attention` | BOOLEAN | Flags low-confidence AI grades for a human |
| `ai_model_used` / `ai_processing_time_ms` / `ai_confidence_score` | | Grading telemetry |

Processed by `create_exam_submission()` and `save_exam_feedback()` RPCs.

---

### Enrollment & Commerce

#### `entitlements`
**The source of truth for course access.** Polymorphic: one row per (user, course, source). Tenant-scoped. Introduced by migration `20260516150000`.

| Column | Type | Notes |
|--------|------|-------|
| `entitlement_id` | BIGINT PK | GENERATED ALWAYS AS IDENTITY |
| `user_id` | UUID FK → auth.users | NOT NULL |
| `course_id` | INTEGER FK → courses(course_id) | NOT NULL |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `source_type` | `entitlement_source` | `product`, `subscription`, `free`, `admin_grant` |
| `source_id` | INTEGER | The product/plan id — NULL for `free` and `admin_grant` |
| `status` | `entitlement_status` | `active`, `revoked`, `expired` (there is **no** `canceled`) |
| `granted_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `expires_at` | TIMESTAMPTZ | NULL = no expiry |
| `revoked_at` | TIMESTAMPTZ | |

`UNIQUE(user_id, course_id, source_type, source_id) NULLS NOT DISTINCT` — so a user can hold access to the same course from a product *and* a subscription simultaneously without collision.

**CHECK `entitlements_source_id_shape`**: `source_id` must be NOT NULL for `product`/`subscription`, and NULL for `free`/`admin_grant`.

Written by `enroll_user()` and `handle_new_subscription()`. Read via `has_course_access(_user_id uuid, _course_id integer)` — note the second arg is `integer`, so cast `::int` when calling from SQL.

#### `enrollments`
**Learning-progress record only** — it does *not* grant access. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `enrollment_id` | INTEGER PK | |
| `user_id` | UUID FK → auth.users | NOT NULL |
| `course_id` | INTEGER FK → courses(course_id) | NOT NULL |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `status` | `enrollement_status` | `active`, `disabled` |
| `enrollment_date` | TIMESTAMPTZ | |

`UNIQUE(user_id, course_id)`

> The old `product_id` / `subscription_id` columns and their "one or the other" CHECK constraint were **dropped** in the entitlements migration. If you find code or docs referencing them, they are out of date. Students on a subscription self-enroll from `/dashboard/student/browse` (`useEnrollment()` hook); subscriptions grant access but do not auto-enroll.

> **Never gate on the presence of an enrollment row** (issue #532). Nothing revokes one — refunds revoke *entitlements* and `tenants.access_cutoff_at` is read only inside `has_course_access()` — so a row survives every revocation path, and until migration `20260725160000` any tenant member could insert one for any course in their tenant. The INSERT policy now also requires `has_course_access()`; legitimate writers (`enroll_user()`, `self_enroll_subscription_course()`, `grant_free_entitlement()`, `issue_certificate_if_eligible()`) are all `SECURITY DEFINER` and unaffected.

#### `products`
Purchasable course bundles. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `product_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `name` | VARCHAR(255) | |
| `description` | TEXT | |
| `price` | NUMERIC | |
| `currency` | `currency_type` | `usd`, `eur`, `mxn`, `cop`, `clp`, `pen`, `ars`, `brl` |
| `image` | TEXT | |
| `payment_provider` | VARCHAR(50) | `stripe`, `manual`, `paypal`, `lemonsqueezy`, `solana`, `solana_subs`, `binance`, `binance_personal` |
| `provider_product_id` | TEXT | **NOT `stripe_product_id`** — provider-agnostic |
| `provider_price_id` | TEXT | **NOT `stripe_price_id`** |
| `status` | VARCHAR(50) | |
| `created_at` | TIMESTAMPTZ | |

#### `product_courses`
Links products to courses. Tenant-scoped. **A course can belong to multiple products — NEVER use `.single()`.**

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `product_id` | INTEGER FK → products | |
| `course_id` | INTEGER FK → courses | |

`UNIQUE(product_id, course_id)`

#### `plans`
Subscription plans sold by a school to its students. Tenant-scoped. **Column names differ from `products` — there is no `name`, no `interval`, no `status`.**

| Column | Type | Notes |
|--------|------|-------|
| `plan_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `plan_name` | VARCHAR(100) | **NOT `name`** |
| `description` | TEXT | |
| `price` | NUMERIC(10,2) | NOT NULL |
| `duration_in_days` | INTEGER | **NOT `interval`** — CHECK > 0 (e.g. 30, 365) |
| `currency` | `currency_type` | `usd`, `eur`, `mxn`, `cop`, `clp`, `pen`, `ars`, `brl` |
| `features` | TEXT | |
| `thumbnail` | TEXT | |
| `payment_provider` | VARCHAR(20) | `stripe`, `manual`, `paypal`, `lemonsqueezy`, `solana`, `solana_subs`, `binance`, `binance_personal` |
| `provider_product_id` | TEXT | Provider-agnostic (**not** `stripe_product_id`) |
| `provider_price_id` | TEXT | |
| `deleted_at` | TIMESTAMPTZ | Soft delete — filter it out |
| `created_at` | TIMESTAMPTZ | |

#### `plan_courses`
Which courses a plan covers. **No `tenant_id`** — scope through the parent plan.

#### `subscriptions`
Student subscriptions to a school's plans. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `subscription_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `user_id` | UUID FK → auth.users | |
| `plan_id` | INTEGER FK → plans | |
| `subscription_status` | VARCHAR | **NOT `status`** |
| `transaction_id` | INTEGER FK → transactions | The purchase that created it |
| `start_date` / `end_date` | TIMESTAMPTZ | |
| `current_period_start` / `current_period_end` | TIMESTAMPTZ | |
| `trial_start` / `trial_end` | TIMESTAMPTZ | |
| `cancel_at` | TIMESTAMPTZ | NULLABLE. When the subscription terminates, or NULL when no cancel is scheduled — informational, never a signal. CHECK `subscriptions_cancel_at_requires_schedule`: non-NULL only while `cancel_at_period_end` (#545) |
| `cancel_at_period_end` | BOOLEAN | NOT NULL DEFAULT false. **The single source of truth for "a cancel is scheduled"** — read by the Solana crank, the expiry crons and the billing UI. It used to be OR'd with `cancel_at <= now()`, and since `cancel_at` defaulted to `now()` on every INSERT, that canceled every `solana_subs` subscription at its first rollover (#545) |
| `canceled_at` / `ended_at` | TIMESTAMPTZ | |
| `superseded_by` | INTEGER | Set on plan change — points at the replacement subscription |
| `payment_provider` | VARCHAR | |
| `provider_subscription_id` | TEXT | **NOT `stripe_subscription_id`** |
| `provider_metadata` | JSONB | |
| `created` | TIMESTAMPTZ | **NOT `created_at`** |

#### `transactions`
Payment transactions. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `transaction_id` | INTEGER PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `user_id` | UUID FK → profiles | |
| `product_id` | INTEGER FK → products | |
| `plan_id` | INTEGER FK → plans | |
| `amount` | NUMERIC(10,2) | |
| `transaction_date` | TIMESTAMPTZ | |
| `payment_method` | VARCHAR(50) | |
| `status` | `transaction_status` | `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded` |
| `currency` | `currency_type` | `usd`, `eur`, `mxn`, `cop`, `clp`, `pen`, `ars`, `brl` |
| `payment_provider` | VARCHAR | |
| `provider_charge_id` | TEXT | Idempotency key for webhooks / on-chain confirms |
| `provider_subscription_id` | TEXT | |
| `provider_metadata` | JSONB | |
| `stripe_payment_intent_id` | TEXT | Stripe-specific, kept for history |
| `school_percentage_snapshot` | NUMERIC | Revenue split frozen at purchase time — database-owned, never caller-supplied |
| `refunded_amount` | NUMERIC(10,2) | Cumulative amount refunded, in MAJOR units of this row's own `currency`. 0 = never refunded (#547) |
| `settlement_currency` / `settlement_base` / `settlement_mint` / `settlement_sol_usd` | | Crypto settlement detail (Solana) — server-owned; `settlement_base` is the figure the on-chain payment is verified against |

**Status is `'successful'`** (NOT `'succeeded'`).

**A refund is not all-or-nothing (#547).** A PARTIAL refund leaves `status = 'successful'` and records the slice in `refunded_amount`; only a FULL refund sets `refunded_amount = amount` and flips `status` to `'refunded'`. **Anything that sums money must use `amount - refunded_amount`**, or it counts money the platform gave back — `netOfRefunds()` in `lib/payments/payouts-owed.ts` is the shared helper, and `tests/unit/phantom-column-guard.test.ts` fails the build if a new reader forgets. Access is revoked only on a full refund.

**There is no `created_at` on this table — it is `transaction_date`.** Querying the former makes PostgREST reject the whole request with 42703; five shipped screens did this and rendered `$0.00` or an empty list rather than an error (#547 §2). Ordering by it is enough to trigger it — the column need not be selected.

**Writes are server-only.** `authenticated` holds no INSERT grant (#538) and only a
three-column UPDATE grant — `status`, `provider_subscription_id`,
`stripe_payment_intent_id` (#528). Every insert goes through a service-role client
(the two checkout routes, the webhooks, the reconcilers, `payment-requests.ts`) or the
SECURITY DEFINER `grant_free_subscription()`. A user-scoped insert fails with
`permission denied for table transactions` — that is deliberate: the row's `amount` and
settlement figures decide what the buyer owes, so they are derived from
`products`/`plans` on the server, never accepted from the caller.

**Three unique indexes, not one** — a purchase is either product-shaped or plan-shaped, never both:

```sql
transactions_unique_product  UNIQUE (user_id, product_id)
  WHERE plan_id IS NULL AND status IN ('pending','successful')
transactions_unique_plan     UNIQUE (user_id, plan_id)
  WHERE product_id IS NULL AND status IN ('pending','successful')
transactions_provider_charge_id_unique  UNIQUE (payment_provider, provider_charge_id)
  WHERE provider_charge_id IS NOT NULL AND status = 'successful'   -- webhook/Solana idempotency
```

Failed payments fall outside the predicate, so retries are allowed.

#### `payment_requests`
Manual/offline payment requests. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `request_id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `user_id` | UUID FK → profiles | Student requesting |
| `product_id` | INTEGER FK → products | |
| `status` | VARCHAR(50) | `pending`, `instructions_sent`, `payment_received`, `confirmed` |
| `created_at` | TIMESTAMPTZ | |

---

### Revenue

#### `revenue_splits`
Platform/school revenue split configuration per tenant.

#### `payouts`
Payout records to schools.

`payout_method` is `'stripe_connect'` (automated Connect payout) or `'manual'` (admin-recorded wire for the platform-settled providers). `UNIQUE (tenant_id, period_start, period_end)` does **not** constrain manual rows — both period columns are nullable for that path and Postgres treats NULLs as distinct — so manual payouts carry `idempotency_key TEXT`, minted once per Mark-as-paid dialog open and enforced by the partial unique index `idx_payouts_manual_idempotency` (#547). `markPayoutPaid` treats the resulting `23505` as success. `CHECK (amount > 0)` forbids a compensating negative row, which is why a duplicate could not be corrected after the fact.

#### `invoices`
Invoice records.

---

### Social & Messaging

#### `chats` & `messages`
General messaging system (AI chat, exam prep, etc.).

#### `reviews`
Course reviews (1-5 rating). `UNIQUE(course_id, user_id)`.

---

### Notifications

#### `notifications`
Admin-created notifications. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `tenant_id` | UUID FK → tenants | |
| `title` | TEXT | |
| `content` | TEXT | |
| `notification_type` | TEXT | `announcement`, `alert`, `info`, `success`, `warning`, `error`, `certificate_issued` |
| `priority` | TEXT | `low`, `normal`, `high`, `urgent` |
| `target_type` | TEXT | `all`, `role`, `course`, `user`, `custom` |
| `target_roles` | TEXT[] | |
| `target_course_id` | BIGINT FK → courses | |
| `target_user_ids` | UUID[] | |
| `status` | TEXT | `draft`, `scheduled`, `sent`, `cancelled` |
| `created_by` | UUID FK → auth.users | |
| `created_at` | TIMESTAMPTZ | |

#### `user_notifications`
Per-user notification delivery tracking.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `notification_id` | BIGINT FK → notifications | |
| `user_id` | UUID FK → auth.users | |
| `in_app_read` | BOOLEAN | |
| `dismissed` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

---

### Certificates

#### `certificate_templates`
Templates for certificate generation. Tenant-scoped (`tenant_id` added via migration).

#### `certificates`
Issued certificates. Tenant-scoped. Has TWO FKs to `profiles` (`user_id`, `revoked_by`) — use FK hint when querying.

RPCs `check_and_issue_certificate()` and `calculate_course_completion()` are `SECURITY DEFINER`.

---

### AI Features

#### `lessons_ai_tasks`
AI task configuration per lesson.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `lesson_id` | BIGINT FK → lessons, UNIQUE | |
| `task_description` | TEXT | Student-facing prompt |
| `ai_instructions` | TEXT | System prompt for AI |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `lessons_ai_task_messages`
AI lesson task chat history.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `lesson_id` | BIGINT FK → lessons | |
| `user_id` | UUID FK → auth.users | |
| `role` | TEXT | `user`, `assistant`, `system` |
| `content` | TEXT | |
| `tool_calls` | JSONB | |
| `tool_invocations` | JSONB | |
| `created_at` | TIMESTAMPTZ | |

#### `prompt_templates`
AI exercise prompt templates. Optionally tenant-scoped (can be global with `NULL` tenant_id).

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `tenant_id` | UUID FK → tenants | Nullable (global if NULL) |
| `name` | VARCHAR(255) | |
| `category` | VARCHAR(100) | `lesson_task`, `exercise`, `exam_grading` |
| `description` | TEXT | |
| `task_description_template` | TEXT | With `{{variables}}` |
| `system_prompt_template` | TEXT | With `{{variables}}` |
| `variables` | JSONB | |
| `is_system` | BOOLEAN | Built-in templates |
| `created_by` | UUID FK → auth.users | |

#### `course_ai_tutors` (Aristotle)
Teacher configuration for per-course AI tutor.

| Column | Type | Notes |
|--------|------|-------|
| `tutor_id` | UUID PK | |
| `course_id` | INTEGER FK → courses, UNIQUE | |
| `tenant_id` | UUID FK → tenants | |
| `persona` | TEXT | |
| `teaching_approach` | TEXT | |
| `boundaries` | TEXT | |
| `enabled` | BOOLEAN | |
| `model_config` | JSONB | |

#### `aristotle_sessions` / `aristotle_messages`
Student chat sessions and messages with the course AI tutor. Both tenant-scoped.

---

### Landing Pages

#### `landing_pages`
Puck visual editor page data. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `page_id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `title` | TEXT | |
| `slug` | TEXT | |
| `is_published` | BOOLEAN | |
| `puck_data` | JSONB | Puck visual editor data |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

`UNIQUE(tenant_id, slug)`. Old `sections`/`settings` columns have been dropped.

Storage bucket: `landing-page-assets` (public, 5MB limit, images only).

---

### Gamification

**10** tables prefixed `gamification_`. Tenant-scoped except `gamification_levels`, which is **global**.

| Table | Purpose |
|-------|---------|
| `gamification_levels` | **GLOBAL** — level thresholds and titles |
| `gamification_profiles` | Per-user XP, level, streaks. Created lazily by `award_xp()` on first award. **No `coins` column** — balance = `floor(total_xp/10) - total_coins_spent` |
| `gamification_xp_transactions` | XP earn/spend log |
| `gamification_achievements` | Achievement definitions (bronze → diamond tiers) |
| `gamification_user_achievements` | Earned achievements per user |
| `gamification_store_items` | Store items. Column is `name` (NOT `title`), `is_available` (NOT `is_active`) |
| `gamification_redemptions` | Item purchases |
| `gamification_user_rewards` | Active rewards (e.g., double XP) |
| `gamification_leaderboard_cache` | Cached leaderboard rankings |
| `gamification_challenge_participants` | Challenge participation |

> `gamification_daily_caps` and `gamification_challenges` were documented here previously but **do not exist** in the database — don't query them.

Weekly leagues live in separate tables: `league_tiers` (global tier definitions) and `league_memberships` (per-user, per-week standings). See [GAMIFICATION.md](./GAMIFICATION.md).

---

### API Tokens

#### `mcp_api_tokens`
Personal access tokens for CLI/programmatic MCP access.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `user_id` | UUID FK → auth.users | |
| `token_hash` | TEXT UNIQUE | SHA-256 hash (never stored plaintext) |
| `name` | TEXT | User-friendly identifier |
| `last_used_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | NULL = never expires |
| `is_active` | BOOLEAN | |
| `created_ip` | INET | |
| `last_used_ip` | INET | |
| `created_at` | TIMESTAMPTZ | |

---

## Platform Billing Tables

### `platform_plans`
Defines the 5-tier pricing (Free, Starter, Pro, Business, Enterprise). Single source of truth for feature gating.

| Column | Type | Notes |
|--------|------|-------|
| `plan_id` | UUID PK | |
| `slug` | VARCHAR(50) UNIQUE | `free`, `starter`, `pro`, `business`, `enterprise` |
| `name` | VARCHAR(100) | |
| `price_monthly` | NUMERIC(10,2) | 0 for free |
| `price_yearly` | NUMERIC(10,2) | ~17% discount |
| `stripe_price_id_monthly` | VARCHAR(255) | |
| `stripe_price_id_yearly` | VARCHAR(255) | |
| `features` | JSONB | Feature flags |
| `limits` | JSONB | `{max_courses, max_students}` — `-1` = unlimited |
| `transaction_fee_percent` | NUMERIC(5,2) | 10% → 0% |
| `sort_order` | INTEGER | |
| `is_active` | BOOLEAN | |

### `platform_subscriptions`
Each school's billing subscription. `UNIQUE(tenant_id)`.

| Column | Type | Notes |
|--------|------|-------|
| `subscription_id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `plan_id` | UUID FK → platform_plans | |
| `stripe_subscription_id` | VARCHAR(255) | |
| `stripe_customer_id` | VARCHAR(255) | |
| `status` | VARCHAR(50) | `active`, `past_due`, `canceled`, `trialing` |
| `payment_method` | VARCHAR(50) | `stripe` or `manual_transfer` |
| `interval` | VARCHAR(20) | `monthly` or `yearly` |

### `platform_payment_requests`
Manual bank transfer requests for plan upgrades (LATAM schools).

| Column | Type | Notes |
|--------|------|-------|
| `request_id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `plan_id` | UUID FK → platform_plans | |
| `requested_by` | UUID FK → profiles | |
| `status` | VARCHAR(50) | `pending` → `instructions_sent` → `payment_received` → `confirmed` |
| `interval` | VARCHAR(20) | |
| `amount` | NUMERIC(10,2) | |
| `confirmed_by` | UUID FK → profiles | |

---

## Database Functions & RPCs

### Authentication

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | **Trigger** on `auth.users` INSERT — creates profile + assigns `student` role |
| `custom_access_token_hook(event JSONB)` | Injects `user_role`, `tenant_role`, `tenant_id`, `is_super_admin` into JWT |

### Enrollment & Payments

| Function | Purpose |
|----------|---------|
| `enroll_user(_user_id uuid, _product_id integer)` | Grants entitlements for **ALL** courses linked to the product (FOR loop over `product_courses`) |
| `handle_new_subscription(_user_id uuid, _plan_id integer, _transaction_id integer, _start_date timestamptz)` | Creates the subscription and writes entitlements for the plan's courses. Trigger-invoked — note the 4th arg |
| `has_course_access(_user_id uuid, _course_id integer)` | Access check against `entitlements`. Second arg is `integer` — cast `::int` when calling from SQL. Has no staff branch: teachers/admins are not implicitly granted access by this function |
| `trigger_manage_transactions()` | **Trigger** on transaction status → `'successful'`: calls `enroll_user()` or `handle_new_subscription()` |

### Exams

| Function | Purpose |
|----------|---------|
| `create_exam_submission(p_student_id uuid, p_exam_id integer, p_answers jsonb)` | Creates exam submission, returns `submission_id` |
| `save_exam_feedback(p_submission_id integer, p_exam_id integer, p_student_id uuid, p_answers jsonb, p_overall_feedback text, p_score numeric, p_question_feedback jsonb, p_ai_model varchar, p_processing_time_ms integer)` | Saves AI feedback. **All params are `p_`-prefixed and there are nine of them** |

### Gamification

| Function | Purpose |
|----------|---------|
| `award_xp(_user_id uuid, _action_type text, _xp_amount integer, _reference_id text, _reference_type text)` | Awards XP, updates streaks, levels up. Creates the gamification profile lazily via UPSERT |
| `award_xp(…, _tenant_id uuid)` | Overload — same, scoped to an explicit tenant. Trigger functions call this one |

### Certificates

| Function | Purpose |
|----------|---------|
| `issue_certificate_if_eligible(p_user_id uuid, p_course_id integer)` | `SECURITY DEFINER` — the auto-issue path. **Template-gated**: with no active `certificate_templates` row for the course, nothing is issued (this is why 100% completion can produce no certificate) |
| `check_and_issue_certificate(p_user_id uuid, p_course_id integer)` | `SECURITY DEFINER` — checks completion and issues |
| `calculate_course_completion(p_user_id uuid, p_course_id integer)` | `SECURITY DEFINER` — % completion for a course |

### Platform

| Function | Purpose |
|----------|---------|
| `get_plan_features(_tenant_id uuid)` | Returns `{plan, plan_name, features, limits, transaction_fee_percent}` for feature gating — single source of truth |
| `get_gamification_features(_tenant_id uuid)` | Gamification feature flags; reads `platform_plans.features` the same way |
| `get_tenant_id()` | Resolves the caller's tenant inside RLS policies (JWT claim → anon header → NULL). Fails closed |
| `get_platform_stats()` | Aggregate platform statistics for the super admin dashboard |
| `validate_mcp_api_token(token_input text)` | Validates an API token, returns user info |

---

## Row Level Security (RLS)

RLS is enabled on **all tenant-scoped tables**. Every table with a `tenant_id` column has RLS policies.

### RLS Policy Pattern

```sql
-- SELECT: users in the tenant can read
CREATE POLICY "Users in tenant can view"
  ON table_name FOR SELECT
  USING (tenant_id IN (
    SELECT tu.tenant_id FROM tenant_users tu
    WHERE tu.user_id = auth.uid() AND tu.status = 'active'
  ));

-- ALL: teachers/admins can manage
CREATE POLICY "Teachers and admins can manage"
  ON table_name FOR ALL
  USING (tenant_id IN (
    SELECT tu.tenant_id FROM tenant_users tu
    WHERE tu.user_id = auth.uid() AND tu.role IN ('teacher', 'admin') AND tu.status = 'active'
  ));
```

**Key Principles**:
- Students can read published content in enrolled courses
- Teachers can manage their own content
- Admins have full access within their tenant
- Users can only update their own profile
- `createAdminClient()` bypasses RLS — always validate tenant ownership manually

---

## Querying the Database

### From Client (Browser)
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('status', 'published')
```

### From Server
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

### Service Role (Admin) — Bypasses RLS
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

const supabase = createAdminClient()
// ALWAYS validate tenant ownership manually before writes
```

---

## Adding New Tables

1. Create the migration: `supabase migration new add_table_name`
2. Write the SQL, including a `tenant_id UUID NOT NULL REFERENCES tenants(id)` column if the table is tenant-scoped
3. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **and** add policies — in the same migration
4. Verify from scratch locally: `npm run db:reset`
5. Regenerate types: `npm run db:types` → writes `lib/database.types.ts`. Commit it with the migration
6. Apply to cloud: `npm run db:push`

> Permissive RLS policies **OR** together — adding a second policy widens access, it never narrows it. To tighten an existing policy you must `DROP POLICY` then `CREATE POLICY`.

---

## Tables without `tenant_id`

Adding `.eq('tenant_id', …)` to any of these **errors the whole query** — a common cause of blank pages. Isolation for the child tables comes from RLS through their parent row.

`aristotle_messages`, `assignments`, `certificate_shares`, `certificate_verification_log`, `chats`, `comment_flags`, `comment_reactions`, `comments`, `community_poll_options`, `content_versions`, `device_push_tokens`, `exam_ai_configs`, `exam_answers`, `exam_question_scores`, `exam_questions`, `exam_scores`, `exam_views`, `exercise_code_student_submissions`, `exercise_completions`, `exercise_files`, `exercise_messages`, `gamification_levels`, `grades`, `issuer_keys`, `landing_page_templates`, `league_tiers`, `lesson_comments`, `lesson_completions`, `lesson_passed`, `lesson_views`, `lessons_ai_task_messages`, `lessons_ai_tasks`, `mcp_api_tokens`, `mcp_audit_log`, `messages`, `notification_preferences`, `permissions`, `plan_courses`, `platform_plans`, `profiles`, `question_options`, `reviews`, `role_permissions`, `roles`, `submissions`, `super_admins`, `system_settings`, `teacher_preview_sessions`, `tenants`, `ticket_messages`, `tickets`, `user_notifications`, `user_roles`, `user_ui_state`, `webhook_events`

Regenerate that list any time:

```sql
SELECT t.table_name FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                    AND c.column_name = 'tenant_id')
ORDER BY 1;
```

---

## Verifying this document

This page is hand-maintained and **will** drift — the schema is 116 tables across 168 migrations. Treat it as orientation, and confirm anything load-bearing against the database itself. The authoritative artifacts, in order:

1. **`lib/database.types.ts`** — generated, always correct if regenerated. Grep it first.
2. **The live database** — introspect it directly.
3. **This document** — curated context and pitfalls that the generated types can't express.

```bash
# Is the committed type file in sync? (empty diff = yes; the only expected
# difference is the __InternalSupabase header that --linked adds)
npx supabase gen types typescript --local --schema public > /tmp/types.ts
diff /tmp/types.ts lib/database.types.ts

# Regenerate the committed file from the linked cloud project
npm run db:types

# Introspect the local database (no psql binary needed)
docker exec -i supabase_db_lms-front psql -U postgres -d postgres -c "\d courses"
docker exec -i supabase_db_lms-front psql -U postgres -d postgres \
  -c "SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'subscriptions' ORDER BY ordinal_position;"

# Every enum and its values
docker exec -i supabase_db_lms-front psql -U postgres -d postgres \
  -c "SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY 1 ORDER BY 1;"

# Exact RPC signatures before calling one
docker exec -i supabase_db_lms-front psql -U postgres -d postgres \
  -c "SELECT p.proname, pg_get_function_identity_arguments(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
      AND p.proname = 'award_xp';"
```

If you find this page wrong, fix it in the same PR — that is how it stays useful.
