# Database Schema Documentation

> ⚠️ **IMPORTANT**: This documentation may contain outdated information. For the **actual, verified** database schema with correct column names discovered from the live database, see **[ACTUAL_SCHEMA.md](./ACTUAL_SCHEMA.md)**.

## 📊 Overview

The LMS database is built on PostgreSQL 15 via Supabase. It consists of 59+ tables organized into logical domains:

- **User Management**: profiles, roles, permissions
- **Multi-Tenancy**: tenants, tenant_users, tenant_settings, super_admins
- **Course Content**: courses, lessons, exercises, exams
- **Enrollment**: enrollments, subscriptions
- **Submissions**: exam submissions, exercise completions
- **Commerce**: products, plans, transactions
- **Platform Billing**: platform_plans, platform_subscriptions, platform_payment_requests
- **Revenue**: revenue_splits, payouts, invoices
- **Gamification**: 12 tables (profiles, xp, levels, achievements, store, challenges, leaderboard)
- **Certificates**: certificates, certificate_templates
- **Social**: messages, comments, reviews
- **Support**: tickets, notifications

## 🗂️ Core Tables

### Users & Authentication

#### `profiles`
User profile information (auto-created on signup)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Key Points**:
- `id` matches `auth.users.id` (Supabase Auth)
- Auto-created by `handle_new_user()` trigger
- Publicly readable, user can only update their own

#### `user_roles`
Assigns roles to users

```sql
CREATE TABLE user_roles (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'student', 'teacher', 'admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
)
```

**Key Points**:
- Users can have multiple roles (e.g., teacher + admin)
- Default role 'student' assigned on signup
- Role is injected into JWT via `custom_access_token_hook()`

#### `roles` & `permissions`
System-wide role definitions and permissions (not actively used in V2, kept for future)

---

### Courses

#### `courses`
Course catalog

```sql
CREATE TABLE courses (
  course_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES course_categories(id),
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published', 'archived'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**RLS Policy**:
- Students: Read published courses they're enrolled in
- Teachers: Full access to their own courses
- Admins: Full access to all courses

#### `course_categories`
Course categorization

```sql
CREATE TABLE course_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
)
```

---

### Lessons

#### `lessons`
Course lessons

```sql
CREATE TABLE lessons (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(course_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT, -- MDX/Markdown content
  video_url TEXT,
  sequence INTEGER NOT NULL, -- Order within course
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, sequence)
)
```

#### `lesson_completions`
Tracking student progress

```sql
CREATE TABLE lesson_completions (
  id SERIAL PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, lesson_id)
)
```

---

### Exams & Exercises

#### `exams`
Course assessments

```sql
CREATE TABLE exams (
  exam_id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(course_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL, -- minutes
  exam_date TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `exam_questions`
Questions within an exam

```sql
CREATE TABLE exam_questions (
  question_id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(exam_id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) NOT NULL, -- 'multiple_choice', 'true_false', 'free_text'
  points INTEGER DEFAULT 1,
  sequence INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `question_options`
Options for multiple choice/true-false

```sql
CREATE TABLE question_options (
  option_id SERIAL PRIMARY KEY,
  question_id INTEGER REFERENCES exam_questions(question_id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

**RLS Policy**:
- Students: Read published courses they're enrolled in
- Teachers: Full access to their own courses
- Admins: Full access to all courses

#### `course_categories`
Course categorization

```sql
CREATE TABLE course_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
)
```

---

### Lessons

#### `lessons`
Course lessons

```sql
CREATE TABLE lessons (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT, -- MDX/Markdown content
  video_url TEXT,
  sequence INTEGER NOT NULL, -- Order within course
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, sequence)
)
```

**Key Points**:
- `sequence` determines order in course
- `content` is MDX (Markdown with JSX)
- `video_url` for optional video embedding

#### `lesson_completions`
Tracks student progress

```sql
CREATE TABLE lesson_completions (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_id, student_id)
)
```

#### `lesson_comments`
Comments on lessons

```sql
CREATE TABLE lesson_comments (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES lesson_comments(id) ON DELETE CASCADE, -- For replies
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Key Points**:
- Hierarchical comments via `parent_id`
- Students can comment on lessons in enrolled courses

---

### Exercises

#### `exercises`
Practice exercises within lessons

```sql
CREATE TABLE exercises (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  exercise_type VARCHAR(50), -- 'code', 'text', 'multiple_choice'
  initial_code TEXT, -- For code exercises
  solution_code TEXT, -- Teacher's solution
  test_cases JSONB, -- Test cases for code exercises
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `exercise_completions`
Student exercise completions

```sql
CREATE TABLE exercise_completions (
  id SERIAL PRIMARY KEY,
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  submission TEXT,
  is_correct BOOLEAN,
  ai_feedback TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, student_id)
)
```

#### `exercise_messages`
AI chat for exercise help

```sql
CREATE TABLE exercise_messages (
  id SERIAL PRIMARY KEY,
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(50), -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

### Exams

#### `exams`
Exams/quizzes

```sql
CREATE TABLE exams (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  passing_score NUMERIC,
  time_limit INTEGER, -- Minutes
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `exam_questions`
Questions within exams

```sql
CREATE TABLE exam_questions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50), -- 'multiple_choice', 'true_false', 'free_text'
  points NUMERIC DEFAULT 1,
  sequence INTEGER NOT NULL,
  correct_answer TEXT, -- For auto-graded questions
  grading_rubric TEXT, -- For AI grading of free text
  UNIQUE(exam_id, sequence)
)
```

#### `question_options`
Multiple choice options

```sql
CREATE TABLE question_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER REFERENCES exam_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  sequence INTEGER NOT NULL
)
```

#### `exam_submissions`
Student exam submissions

```sql
CREATE TABLE exam_submissions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  answers JSONB NOT NULL, -- { question_id: answer }
  score NUMERIC,
  ai_data JSONB, -- AI feedback per question
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  is_reviewed BOOLEAN DEFAULT FALSE
)
```

**Key Points**:
- `answers` is JSONB: `{ "1": "answer text", "2": "option_id" }`
- `ai_data` contains AI feedback per question
- Processed by `create_exam_submission()` and `save_exam_feedback()` functions

---

### Enrollment & Commerce

#### `enrollments`
Student course enrollments

```sql
CREATE TABLE enrollments (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
)
```

**Key Points**:
- Auto-created by `enroll_user()` function
- Can be created by payment webhook or manual enrollment
- Determines course access via RLS

#### `products`
Individual course products

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `product_courses`
Links products to courses

```sql
CREATE TABLE product_courses (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(product_id, course_id)
)
```

#### `plans`
Subscription plans

```sql
CREATE TABLE plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  interval VARCHAR(50), -- 'month', 'year'
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `plan_courses`
Links plans to courses (plan grants access to multiple courses)

```sql
CREATE TABLE plan_courses (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(plan_id, course_id)
)
```

#### `subscriptions`
User subscriptions to plans

```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES plans(id),
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'cancelled', 'expired'
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `transactions`
Payment transactions

```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  plan_id INTEGER REFERENCES plans(id),
  amount NUMERIC NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'successful', 'failed'
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
)
```

**Key Points**:
- Trigger `trigger_manage_transactions()` fires on status change to 'successful'
- Auto-creates enrollment via `enroll_user()` or subscription via `handle_new_subscription()`

---

### Social & Notifications

#### `messages` & `chats`
General messaging system (for AI chat and future direct messaging)

```sql
CREATE TABLE chats (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  chat_type VARCHAR(50), -- 'exam_prep', 'general', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
  role VARCHAR(50), -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `reviews`
Course reviews

```sql
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, user_id)
)
```

#### `notifications`
User notifications

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type VARCHAR(100),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

### Support

#### `tickets`
Support tickets

```sql
CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  priority VARCHAR(50) DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### `ticket_messages`
Messages within support tickets

```sql
CREATE TABLE ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_staff BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## 🔧 Database Functions

### Authentication

#### `handle_new_user()`
**Trigger**: Fires when new user signs up via Supabase Auth

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

**Purpose**: Auto-creates profile and assigns 'student' role

#### `custom_access_token_hook(event JSONB)`
**Purpose**: Injects `user_role` claim into JWT token

**Returns**: Modified JWT event with role claim

---

### Enrollment

#### `enroll_user(user_id UUID, product_id INTEGER)`
**Purpose**: Enrolls user in all courses linked to a product

**Process**:
1. Find courses linked to product via `product_courses`
2. Create enrollment records
3. Create notification

---

### Payments

#### `trigger_manage_transactions()`
**Trigger**: Fires when transaction status changes to 'successful'

**Purpose**: Auto-processes successful payments
- If `product_id`: calls `enroll_user()`
- If `plan_id`: calls `handle_new_subscription()`

#### `handle_new_subscription(user_id UUID, plan_id INTEGER, transaction_id INTEGER, start_date TIMESTAMPTZ)`
**Purpose**: Creates subscription and enrolls in all plan courses

---

### Exams

#### `create_exam_submission(student_id UUID, exam_id INTEGER, answers JSONB)`
**Purpose**: Creates exam submission record

**Returns**: Submission ID

#### `save_exam_feedback(submission_id INTEGER, exam_id INTEGER, student_id UUID, answers JSONB, overall_feedback TEXT, score NUMERIC)`
**Purpose**: Saves AI-generated feedback to exam submission

**Updates**: `ai_data`, `score`, `evaluated_at`, `is_reviewed`

---

### Notifications

#### `create_notification(user_id UUID, notification_type VARCHAR, message TEXT)`
**Purpose**: Creates a notification for a user

---

## 💳 Platform Billing Tables

### `platform_plans`
Defines the 5-tier pricing (Free, Starter, Pro, Business, Enterprise).

| Column | Type | Description |
|--------|------|-------------|
| `plan_id` | UUID PK | |
| `slug` | VARCHAR(50) UNIQUE | `free`, `starter`, `pro`, `business`, `enterprise` |
| `name` | VARCHAR(100) | Display name |
| `price_monthly` | NUMERIC(10,2) | Monthly price (0 for free) |
| `price_yearly` | NUMERIC(10,2) | Yearly price (~17% discount) |
| `stripe_price_id_monthly` | VARCHAR(255) | Stripe Price ID for monthly billing |
| `stripe_price_id_yearly` | VARCHAR(255) | Stripe Price ID for yearly billing |
| `features` | JSONB | Feature flags: `{leaderboard, achievements, store, certificates, analytics, ai_grading, ...}` |
| `limits` | JSONB | `{max_courses, max_students}` — `-1` means unlimited |
| `transaction_fee_percent` | NUMERIC(5,2) | Platform fee on student payments (10% → 0%) |
| `sort_order` | INTEGER | Display order |
| `is_active` | BOOLEAN | Whether plan is available |

### `platform_subscriptions`
Tracks each school's billing subscription. `UNIQUE(tenant_id)`.

| Column | Type | Description |
|--------|------|-------------|
| `subscription_id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | One per tenant |
| `plan_id` | UUID FK → platform_plans | Current plan |
| `stripe_subscription_id` | VARCHAR(255) | Stripe Subscription ID |
| `stripe_customer_id` | VARCHAR(255) | Stripe Customer ID |
| `status` | VARCHAR(50) | `active`, `past_due`, `canceled`, `trialing` |
| `payment_method` | VARCHAR(50) | `stripe` or `manual_transfer` |
| `interval` | VARCHAR(20) | `monthly` or `yearly` |
| `current_period_start/end` | TIMESTAMPTZ | Billing period dates |
| `cancel_at_period_end` | BOOLEAN | Scheduled cancellation |

### `platform_payment_requests`
Manual bank transfer requests for school plan upgrades (LATAM schools without international cards).

| Column | Type | Description |
|--------|------|-------------|
| `request_id` | UUID PK | |
| `tenant_id` | UUID FK → tenants | |
| `plan_id` | UUID FK → platform_plans | Requested plan |
| `requested_by` | UUID FK → profiles | Admin who requested |
| `status` | VARCHAR(50) | `pending` → `instructions_sent` → `payment_received` → `confirmed` |
| `interval` | VARCHAR(20) | `monthly` or `yearly` |
| `amount` | NUMERIC(10,2) | Plan price |
| `confirmed_by` | UUID FK → profiles | Super admin who confirmed |

### `tenants` (Billing Columns Added)

| Column | Type | Description |
|--------|------|-------------|
| `stripe_customer_id` | VARCHAR(255) | For platform billing (NOT student payments) |
| `billing_email` | VARCHAR(255) | Billing contact email |
| `billing_period_end` | TIMESTAMPTZ | Current billing period end |
| `billing_status` | VARCHAR(50) | `free`, `active`, `past_due`, `canceled` |

### Key RPC: `get_plan_features(_tenant_id UUID)`

Returns plan features/limits for a tenant. Single source of truth for feature gating.

```sql
-- Returns: {plan, plan_name, features, limits, transaction_fee_percent}
SELECT * FROM get_plan_features('tenant-uuid-here');
```

---

## 🔒 RLS Policies (To Be Implemented)

See [RLS_POLICIES.md](./RLS_POLICIES.md) for detailed policies.

**Key Principles**:
- Students can only read published content in enrolled courses
- Teachers can manage their own content
- Admins have full access
- Users can only update their own profile

---

## 📝 Adding New Tables

When adding a new table:

1. **Create migration file**:
   ```bash
   supabase migration new add_table_name
   ```

2. **Write SQL**:
   ```sql
   CREATE TABLE table_name (
     id SERIAL PRIMARY KEY,
     -- columns...
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Add RLS policies**:
   ```sql
   ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "policy_name" ON table_name ...;
   ```

4. **Apply migration**:
   ```bash
   supabase db push
   ```

5. **Update TypeScript types** (if using Supabase CLI):
   ```bash
   supabase gen types typescript --local > types/database.ts
   ```

---

## 🔍 Querying the Database

### From Client (Browser)
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// RLS automatically filters based on user
const { data, error } = await supabase
  .from('courses')
  .select('*')
  .eq('status', 'published')
```

### From Server
```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()

// Still respects RLS, but runs server-side
const { data, error } = await supabase
  .from('lessons')
  .select('*, course:courses(*)')
  .eq('course_id', courseId)
```

### Service Role (Admin)
```typescript
// Only use for admin operations!
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypasses RLS!
)
```

---

## 📊 Common Queries

### Get student's enrolled courses with progress
```typescript
const { data } = await supabase
  .from('enrollments')
  .select(`
    *,
    course:courses (
      *,
      lessons (count)
    ),
    lesson_completions:lesson_completions (count)
  `)
  .eq('user_id', userId)
  .eq('status', 'active')
```

### Get course with all lessons in order
```typescript
const { data } = await supabase
  .from('courses')
  .select(`
    *,
    lessons (
      *,
      lesson_completions (
        completed_at
      )
    )
  `)
  .eq('id', courseId)
  .eq('lessons.status', 'published')
  .order('sequence', { foreignTable: 'lessons' })
  .single()
```

### Get exam with questions and options
```typescript
const { data } = await supabase
  .from('exams')
  .select(`
    *,
    exam_questions (
      *,
      question_options (*)
    )
  `)
  .eq('id', examId)
  .order('sequence', { foreignTable: 'exam_questions' })
  .single()
```
