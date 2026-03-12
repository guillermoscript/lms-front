# Database Schema Documentation

## Overview

The LMS database is built on PostgreSQL 15 via Supabase. It consists of **65+ tables** organized into logical domains:

- **User Management**: `profiles` (global), `user_roles`, `roles`, `permissions`
- **Multi-Tenancy**: `tenants`, `tenant_users`, `tenant_settings`, `tenant_invitations`, `super_admins`
- **Course Content**: `courses`, `lessons`, `exercises`, `exams`, `exam_questions`, `question_options`, `lesson_resources`, `lessons_ai_tasks`, `lessons_ai_task_messages`, `prompt_templates`
- **Enrollment & Progress**: `enrollments`, `subscriptions`, `lesson_completions`, `exam_submissions`, `exercise_completions`
- **Commerce**: `products`, `product_courses`, `plans`, `transactions`, `payment_requests`
- **Platform Billing**: `platform_plans`, `platform_subscriptions`, `platform_payment_requests`
- **Revenue**: `revenue_splits`, `payouts`, `invoices`
- **Gamification**: 12 tables (`gamification_profiles`, `gamification_xp_transactions`, `gamification_levels`, `gamification_achievements`, `gamification_user_achievements`, `gamification_store_items`, `gamification_redemptions`, `gamification_user_rewards`, `gamification_leaderboard_cache`, `gamification_challenge_participants`, `gamification_daily_caps`, `gamification_challenges`)
- **Certificates**: `certificates`, `certificate_templates`
- **AI Tutoring**: `course_ai_tutors`, `aristotle_sessions`, `aristotle_messages`
- **Landing Pages**: `landing_pages`, `landing_page_templates`
- **Social**: `messages`, `chats`, `lesson_comments`, `reviews`
- **Support**: `tickets`, `ticket_messages`
- **Notifications**: `notifications`, `user_notifications`, `notification_templates`, `notification_preferences`
- **API/MCP**: `mcp_api_tokens`
- **Media**: `exercise_media_submissions`

### Conventions & Pitfalls

- **Primary keys use `_id` suffix**: `product_id`, `course_id`, `enrollment_id`, `transaction_id`, `submission_id`, `request_id`, `exam_id`, `question_id`, `option_id`, `score_id`
- **`profiles` is GLOBAL** — no `tenant_id` column. Same for `gamification_levels`.
- **`lesson_completions` uses `user_id`** (NOT `student_id`)
- **`exam_submissions` order column is `submission_date`** (NOT `submitted_at`)
- **Transaction status is `'successful'`** (NOT `'succeeded'`). Full enum: `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded`
- **`product_courses` can have multiple rows per course** — a single course can belong to many products. **NEVER use `.single()`** on this table.
- **Enrollment status** uses enum `enrollement_status`: `'active'` | `'disabled'` (note the typo in the enum name is intentional/legacy)
- **Enrollments CHECK constraint**: requires either `product_id` OR `subscription_id` (not both, not neither)
- **`certificates` has TWO FKs to `profiles`** (`user_id`, `revoked_by`) — must use FK hint: `profiles!certificates_user_id_fkey(...)`
- **`profiles` has NO `email` column** — get emails via `createAdminClient().auth.admin.getUserById()`

---

## Core Tables

### Users & Authentication

#### `profiles`
**GLOBAL table** — no `tenant_id` column. Auto-created on signup by `handle_new_user()` trigger.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | References `auth.users(id)` |
| `full_name` | TEXT | |
| `avatar_url` | TEXT | |
| `bio` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

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
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

No `slug` column — use `course_id` for routing.

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
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

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
| `initial_code` | TEXT | For code exercises |
| `solution_code` | TEXT | |
| `test_cases` | JSONB | |
| `status` | VARCHAR(50) | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**`exercise_type` enum values:** `quiz`, `coding_challenge`, `essay`, `multiple_choice`, `true_false`, `fill_in_the_blank`, `discussion`, `audio_evaluation`, `video_evaluation`, `real_time_conversation`, `artifact`

#### `exercise_completions`
Student exercise submissions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `exercise_id` | INTEGER FK → exercises | |
| `student_id` | UUID FK → profiles | |
| `submission` | TEXT | |
| `is_correct` | BOOLEAN | |
| `ai_feedback` | TEXT | |
| `completed_at` | TIMESTAMPTZ | |

`UNIQUE(exercise_id, student_id)`

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

| Column | Type | Notes |
|--------|------|-------|
| `question_id` | SERIAL PK | |
| `exam_id` | INTEGER FK → exams(exam_id) | |
| `question_text` | TEXT | |
| `question_type` | VARCHAR(50) | `multiple_choice`, `true_false`, `free_text` |
| `points` | INTEGER | Default 1 |
| `sequence` | INTEGER | |
| `created_at` | TIMESTAMPTZ | |

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
| `evaluated_at` | TIMESTAMPTZ | |
| `is_reviewed` | BOOLEAN | |

Processed by `create_exam_submission()` and `save_exam_feedback()` RPCs.

---

### Enrollment & Commerce

#### `enrollments`
Student course enrollments. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `enrollment_id` | INTEGER PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `user_id` | UUID FK → profiles | |
| `course_id` | INTEGER FK → courses(course_id) | |
| `product_id` | INTEGER FK → products | |
| `subscription_id` | INTEGER FK → subscriptions | |
| `status` | `enrollement_status` | `active`, `disabled` |
| `enrollment_date` | TIMESTAMPTZ | |

**CHECK constraint**: `(product_id IS NOT NULL AND subscription_id IS NULL) OR (product_id IS NULL AND subscription_id IS NOT NULL)`

Auto-created by `enroll_user()` RPC.

#### `products`
Purchasable course bundles. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `product_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `name` | VARCHAR(255) | |
| `description` | TEXT | |
| `price` | NUMERIC | |
| `stripe_product_id` | TEXT | |
| `stripe_price_id` | TEXT | |
| `payment_provider` | VARCHAR(50) | `stripe`, `manual`, `paypal` |
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
Subscription plans (school-level). Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `plan_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `name` | VARCHAR(255) | |
| `description` | TEXT | |
| `price` | NUMERIC | |
| `interval` | VARCHAR(50) | `month`, `year` |
| `stripe_product_id` | TEXT | |
| `stripe_price_id` | TEXT | |
| `status` | VARCHAR(50) | |
| `created_at` | TIMESTAMPTZ | |

#### `subscriptions`
User subscriptions to plans. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `subscription_id` | SERIAL PK | |
| `tenant_id` | UUID FK → tenants | NOT NULL |
| `user_id` | UUID FK → profiles | |
| `plan_id` | INTEGER FK → plans | |
| `status` | VARCHAR(50) | `active`, `cancelled`, `expired` |
| `start_date` | TIMESTAMPTZ | |
| `end_date` | TIMESTAMPTZ | |
| `stripe_subscription_id` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

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
| `currency` | `currency_type` | `usd`, `eur` |

**Status is `'successful'`** (NOT `'succeeded'`).

Partial unique index: `(user_id, product_id, plan_id) WHERE status IN ('pending', 'successful')` — allows retries after failed payments.

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

12 tables, all prefixed `gamification_`. Tenant-scoped (via migration) except `gamification_levels` which is **global**.

| Table | Purpose |
|-------|---------|
| `gamification_levels` | **GLOBAL** — level thresholds and titles |
| `gamification_profiles` | Per-user XP, level, streaks. `UNIQUE(user_id)` |
| `gamification_xp_transactions` | XP earn/spend log |
| `gamification_achievements` | Achievement definitions (bronze → diamond tiers) |
| `gamification_user_achievements` | Earned achievements per user |
| `gamification_store_items` | Store items. Column is `name` (NOT `title`), `is_available` (NOT `is_active`) |
| `gamification_redemptions` | Item purchases |
| `gamification_user_rewards` | Active rewards (e.g., double XP) |
| `gamification_leaderboard_cache` | Cached leaderboard rankings |
| `gamification_challenge_participants` | Challenge participation |
| `gamification_daily_caps` | Daily XP caps |
| `gamification_challenges` | Challenge definitions |

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
| `enroll_user(_user_id UUID, _product_id INTEGER)` | Enrolls user in ALL courses linked to product (loops via `product_courses`) |
| `handle_new_subscription(_user_id UUID, _plan_id INTEGER)` | Creates subscription and enrolls in plan courses |
| `trigger_manage_transactions()` | **Trigger** on transaction status → `'successful'`: calls `enroll_user()` or `handle_new_subscription()` |

### Exams

| Function | Purpose |
|----------|---------|
| `create_exam_submission(student_id, exam_id, answers)` | Creates exam submission, returns `submission_id` |
| `save_exam_feedback(submission_id, exam_id, student_id, answers, overall_feedback, score)` | Saves AI feedback to submission |

### Gamification

| Function | Purpose |
|----------|---------|
| `award_xp(_user_id, _action_type, _xp_amount, _reference_id, _reference_type)` | Awards XP, updates streaks, levels up |

### Certificates

| Function | Purpose |
|----------|---------|
| `check_and_issue_certificate()` | `SECURITY DEFINER` — checks completion and issues certificate |
| `calculate_course_completion()` | `SECURITY DEFINER` — calculates % completion for a course |

### Platform

| Function | Purpose |
|----------|---------|
| `get_plan_features(_tenant_id UUID)` | Returns `{plan, plan_name, features, limits, transaction_fee_percent}` for feature gating |
| `get_platform_stats()` | Returns aggregate platform statistics for super admin dashboard |
| `validate_mcp_api_token(token_input TEXT)` | Validates API token, returns user info |

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

1. Create migration: `supabase migration new add_table_name`
2. Write SQL with `tenant_id` column (if tenant-scoped)
3. Add RLS policies
4. Apply: `supabase db push`
5. Update types: `supabase gen types typescript --local > types/database.ts`
