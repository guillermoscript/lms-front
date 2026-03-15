-- =============================================================================
-- LMS V2 — Minimal Development Seed
-- Reset-safe: every INSERT uses ON CONFLICT DO NOTHING / DO UPDATE
-- Apply via: supabase db reset  (runs migrations then this file)
-- =============================================================================
--
-- TEST ACCOUNTS (all passwords: password123)
-- ─────────────────────────────────────────
--   student@e2etest.com   student on Default School
--   owner@e2etest.com     admin on Default School + super_admin
--   creator@codeacademy.com  admin on Code Academy Pro
--   alice@student.com     student on Code Academy Pro
--
-- TENANTS
-- ─────────────────────────────────────────
--   default  → http://lvh.me:3000        (ID: 00000000-0000-0000-0000-000000000001)
--   code-academy → http://code-academy.lvh.me:3000
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. PLATFORM PLANS  (idempotent — already seeded by migration but kept here
--    so `supabase db reset` produces a consistent state)
-- ---------------------------------------------------------------------------
INSERT INTO platform_plans (slug, name, description, price_monthly, price_yearly, transaction_fee_percent, sort_order, features, limits)
VALUES
(
  'free', 'Free', 'Get started with basic features',
  0, 0, 10.00, 0,
  '{"leaderboard":false,"achievements":false,"store":false,"certificates":"basic","analytics":false,"ai_grading":false,"custom_branding":false,"custom_domain":false,"api_access":false,"white_label":false,"priority_support":false,"xp":true,"levels":true,"streaks":true}'::jsonb,
  '{"max_courses":5,"max_students":50}'::jsonb
),
(
  'starter', 'Starter', 'For growing schools that need more capacity',
  9, 90, 5.00, 1,
  '{"leaderboard":true,"achievements":true,"store":false,"certificates":"custom","analytics":"basic","ai_grading":false,"custom_branding":false,"custom_domain":false,"api_access":false,"white_label":false,"priority_support":false,"xp":true,"levels":true,"streaks":true}'::jsonb,
  '{"max_courses":15,"max_students":200}'::jsonb
),
(
  'pro', 'Pro', 'Advanced features for professional educators',
  29, 290, 2.00, 2,
  '{"leaderboard":true,"achievements":true,"store":true,"certificates":"custom","analytics":"advanced","ai_grading":true,"custom_branding":false,"custom_domain":false,"api_access":false,"white_label":false,"priority_support":false,"xp":true,"levels":true,"streaks":true}'::jsonb,
  '{"max_courses":100,"max_students":1000}'::jsonb
),
(
  'business', 'Business', 'Full platform with custom branding and priority support',
  79, 790, 0, 3,
  '{"leaderboard":true,"achievements":true,"store":true,"certificates":"custom","analytics":"advanced","ai_grading":true,"custom_branding":true,"custom_domain":true,"api_access":false,"white_label":false,"priority_support":true,"xp":true,"levels":true,"streaks":true}'::jsonb,
  '{"max_courses":-1,"max_students":5000}'::jsonb
),
(
  'enterprise', 'Enterprise', 'Unlimited everything with white-label and API access',
  199, 1990, 0, 4,
  '{"leaderboard":true,"achievements":true,"store":true,"certificates":"custom","analytics":"advanced","ai_grading":true,"custom_branding":true,"custom_domain":true,"api_access":true,"white_label":true,"priority_support":true,"xp":true,"levels":true,"streaks":true}'::jsonb,
  '{"max_courses":-1,"max_students":-1}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 1. TENANTS
-- ---------------------------------------------------------------------------

-- Default tenant (main platform / default school)
-- Created by migration 20260216200000 — kept here for completeness
INSERT INTO tenants (id, slug, name, primary_color, secondary_color, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default School', '#2563eb', '#7c3aed', 'free', 'active')
ON CONFLICT (id) DO NOTHING;

-- Code Academy — used for subdomain E2E tests (code-academy.lvh.me:3000)
INSERT INTO tenants (id, slug, name, primary_color, secondary_color, plan, status, billing_status)
VALUES ('00000000-0000-0000-0000-000000000002', 'code-academy', 'Code Academy Pro', '#7c3aed', '#2563eb', 'pro', 'active', 'active')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. AUTH USERS
-- Trigger handle_new_user() does NOT fire on direct SQL inserts —
-- profiles, user_roles, and auth.identities are inserted manually below.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
-- student@e2etest.com / password123
(
  '00000000-0000-0000-0000-000000000000',
  'a1000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'student@e2etest.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,
  '{"full_name":"Test Student","preferred_tenant_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,
  now(), now(), '', '', '', ''
),
-- owner@e2etest.com / password123  (admin of Default School + super admin)
(
  '00000000-0000-0000-0000-000000000000',
  'a1000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated',
  'owner@e2etest.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,
  '{"full_name":"School Owner","preferred_tenant_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,
  now(), now(), '', '', '', ''
),
-- creator@codeacademy.com / password123  (admin of Code Academy)
(
  '00000000-0000-0000-0000-000000000000',
  'a1000000-0000-0000-0000-000000000003',
  'authenticated', 'authenticated',
  'creator@codeacademy.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-0000-0000-000000000002"}'::jsonb,
  '{"full_name":"Code Academy Creator","preferred_tenant_id":"00000000-0000-0000-0000-000000000002"}'::jsonb,
  now(), now(), '', '', '', ''
),
-- alice@student.com / password123  (student of Code Academy)
(
  '00000000-0000-0000-0000-000000000000',
  'a1000000-0000-0000-0000-000000000004',
  'authenticated', 'authenticated',
  'alice@student.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-0000-0000-000000000002"}'::jsonb,
  '{"full_name":"Alice Student","preferred_tenant_id":"00000000-0000-0000-0000-000000000002"}'::jsonb,
  now(), now(), '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. AUTH IDENTITIES  (required for email/password login)
-- ---------------------------------------------------------------------------
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES
(
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  '{"sub":"a1000000-0000-0000-0000-000000000001","email":"student@e2etest.com"}'::jsonb,
  'email', 'student@e2etest.com', now(), now(), now()
),
(
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002',
  '{"sub":"a1000000-0000-0000-0000-000000000002","email":"owner@e2etest.com"}'::jsonb,
  'email', 'owner@e2etest.com', now(), now(), now()
),
(
  'a1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  '{"sub":"a1000000-0000-0000-0000-000000000003","email":"creator@codeacademy.com"}'::jsonb,
  'email', 'creator@codeacademy.com', now(), now(), now()
),
(
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000004',
  '{"sub":"a1000000-0000-0000-0000-000000000004","email":"alice@student.com"}'::jsonb,
  'email', 'alice@student.com', now(), now(), now()
)
ON CONFLICT (provider, provider_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. PROFILES  (global — no tenant_id)
-- ---------------------------------------------------------------------------
INSERT INTO profiles (id, full_name, username, onboarding_completed)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Test Student',          'test_student',   false),
  ('a1000000-0000-0000-0000-000000000002', 'School Owner',          'school_owner',   true),
  ('a1000000-0000-0000-0000-000000000003', 'Code Academy Creator',  'ca_creator',     true),
  ('a1000000-0000-0000-0000-000000000004', 'Alice Student',         'alice_student',  false)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. USER ROLES  (global fallback roles)
-- ---------------------------------------------------------------------------
INSERT INTO user_roles (user_id, role)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'student'),
  ('a1000000-0000-0000-0000-000000000002', 'admin'),
  ('a1000000-0000-0000-0000-000000000003', 'admin'),
  ('a1000000-0000-0000-0000-000000000004', 'student')
ON CONFLICT (user_id, role) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 6. TENANT USERS  (per-tenant roles — authoritative source)
-- ---------------------------------------------------------------------------
INSERT INTO tenant_users (tenant_id, user_id, role, status)
VALUES
  -- Default School
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'student', 'active'),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'admin',   'active'),
  -- Code Academy Pro
  ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 'admin',   'active'),
  ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', 'student', 'active')
ON CONFLICT (tenant_id, user_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 7. SUPER ADMINS
-- ---------------------------------------------------------------------------
INSERT INTO super_admins (user_id)
VALUES ('a1000000-0000-0000-0000-000000000002')
ON CONFLICT (user_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 8. COURSE CATEGORIES
-- ---------------------------------------------------------------------------
INSERT INTO course_categories (name, description)
VALUES
  ('Programming',  'Learn to code in various programming languages'),
  ('Design',       'Master design principles and tools'),
  ('Business',     'Business and entrepreneurship courses'),
  ('Data Science', 'Data analysis, ML, and statistics')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 9. COURSES  — Default School (tenant 00000000-0000-0000-0000-000000000001)
-- Uses OVERRIDING SYSTEM VALUE so IDs are stable across resets.
-- ---------------------------------------------------------------------------
INSERT INTO courses (course_id, title, description, status, author_id, tenant_id, category_id)
OVERRIDING SYSTEM VALUE
VALUES
(
  1001,
  'Introduction to Testing',
  'Learn the fundamentals of software testing: unit tests, integration tests, and E2E automation.',
  'published',
  'a1000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM course_categories WHERE name = 'Programming' LIMIT 1)
),
(
  1002,
  'Web Development Basics',
  'HTML, CSS, and JavaScript from scratch. Build your first interactive website.',
  'published',
  'a1000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM course_categories WHERE name = 'Programming' LIMIT 1)
)
ON CONFLICT (course_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 10. COURSES — Code Academy Pro (tenant 00000000-0000-0000-0000-000000000002)
-- ---------------------------------------------------------------------------
INSERT INTO courses (course_id, title, description, status, author_id, tenant_id, category_id)
OVERRIDING SYSTEM VALUE
VALUES
(
  2001,
  'Python for Beginners',
  'Master Python from zero to writing real scripts. Includes exercises and quizzes.',
  'published',
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  (SELECT id FROM course_categories WHERE name = 'Programming' LIMIT 1)
),
(
  2002,
  'Data Analysis with Pandas',
  'Wrangle, analyse, and visualise data using Python and the Pandas library.',
  'published',
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  (SELECT id FROM course_categories WHERE name = 'Data Science' LIMIT 1)
)
ON CONFLICT (course_id) DO NOTHING;

-- Advance sequences past the seeded IDs so future INSERTs don't collide
SELECT setval('courses_course_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 11. LESSONS
-- ---------------------------------------------------------------------------
INSERT INTO lessons (id, course_id, title, description, content, sequence, status, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
-- Default School — Course 1001
(
  1001, 1001, 'What is Software Testing?',
  'Overview of testing concepts and why they matter.',
  '# What is Software Testing?

Software testing is the process of evaluating a system to find bugs and ensure it meets requirements.

## Types of Tests
- **Unit tests** — test individual functions in isolation
- **Integration tests** — test how components work together
- **E2E tests** — simulate real user behaviour in a browser

> "Testing shows the presence of bugs, not their absence." — Dijkstra',
  1, 'published',
  '00000000-0000-0000-0000-000000000001'
),
(
  1002, 1001, 'Writing Your First Unit Test',
  'Hands-on: write a unit test in JavaScript with Jest.',
  '# Writing Your First Unit Test

```javascript
// sum.js
export function sum(a, b) { return a + b }

// sum.test.js
import { sum } from "./sum"
test("adds 1 + 2 to equal 3", () => {
  expect(sum(1, 2)).toBe(3)
})
```

Run with `npx jest` and watch it go green.',
  2, 'published',
  '00000000-0000-0000-0000-000000000001'
),
-- Default School — Course 1002
(
  1003, 1002, 'HTML Fundamentals',
  'Tags, attributes, and semantic structure.',
  '# HTML Fundamentals

HTML is the backbone of every web page.

```html
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Hello</title></head>
  <body>
    <h1>My First Page</h1>
    <p>Welcome to the web!</p>
  </body>
</html>
```',
  1, 'published',
  '00000000-0000-0000-0000-000000000001'
),
-- Code Academy — Course 2001
(
  2001, 2001, 'Python Variables and Types',
  'Integers, strings, lists, and dictionaries.',
  '# Python Variables and Types

```python
name = "Alice"        # str
age  = 30             # int
pi   = 3.14           # float
tags = ["python", "beginner"]  # list
info = {"name": name, "age": age}   # dict

print(f"Hello, {name}! You are {age} years old.")
```',
  1, 'published',
  '00000000-0000-0000-0000-000000000002'
),
(
  2002, 2001, 'Control Flow in Python',
  'if/else, for loops, and while loops.',
  '# Control Flow

```python
for i in range(1, 6):
    if i % 2 == 0:
        print(f"{i} is even")
    else:
        print(f"{i} is odd")
```',
  2, 'published',
  '00000000-0000-0000-0000-000000000002'
),
-- Code Academy — Course 2002
(
  2003, 2002, 'Intro to Pandas',
  'DataFrames, Series, and basic operations.',
  '# Intro to Pandas

```python
import pandas as pd

df = pd.DataFrame({
    "name":  ["Alice", "Bob", "Carol"],
    "score": [92, 85, 78]
})

print(df.describe())
print(df[df["score"] > 80])
```',
  1, 'published',
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

SELECT setval('lessons_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 12. PRODUCTS  (purchasable course bundles)
-- ---------------------------------------------------------------------------
INSERT INTO products (product_id, name, description, price, currency, status, payment_provider, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(
  1001,
  'Testing Fundamentals Package',
  'Lifetime access to Introduction to Testing.',
  29.00, 'usd', 'active', 'stripe',
  '00000000-0000-0000-0000-000000000001'
),
(
  1002,
  'Web Dev Starter',
  'Everything you need to build your first website.',
  0.00, 'usd', 'active', 'manual',
  '00000000-0000-0000-0000-000000000001'
),
(
  2001,
  'Python Mastery Bundle',
  'Python for Beginners + Data Analysis with Pandas.',
  49.00, 'usd', 'active', 'stripe',
  '00000000-0000-0000-0000-000000000002'
),
(
  2002,
  'Code Academy Pro Monthly',
  'Full access to all Code Academy courses.',
  19.00, 'usd', 'active', 'stripe',
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (product_id) DO NOTHING;

SELECT setval('products_product_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 13. PRODUCT → COURSE LINKS
-- Note: product_courses PK is on product_id alone — one product per course.
-- "Multiple rows per course" means the same course can appear in multiple
-- products (e.g. same course sold individually AND via a bundle product).
-- ---------------------------------------------------------------------------
INSERT INTO product_courses (product_id, course_id, tenant_id)
VALUES
  (1001, 1001, '00000000-0000-0000-0000-000000000001'),  -- Testing Package → Intro to Testing
  (1002, 1002, '00000000-0000-0000-0000-000000000001'),  -- Web Dev Starter → Web Dev Basics
  (2001, 2001, '00000000-0000-0000-0000-000000000002'),  -- Python Bundle → Python for Beginners
  (2002, 2002, '00000000-0000-0000-0000-000000000002')   -- Code Academy Monthly → Data Analysis
ON CONFLICT (product_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 14. ENROLLMENTS
-- student@e2etest.com enrolled in Default School courses
-- alice@student.com   has NO enrollments — tests plan purchase → self-enroll flow
-- ---------------------------------------------------------------------------
INSERT INTO enrollments (enrollment_id, user_id, course_id, product_id, status, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(
  1001,
  'a1000000-0000-0000-0000-000000000001',  -- student@e2etest.com
  1001,                                     -- Intro to Testing
  1001,                                     -- Testing Fundamentals Package
  'active',
  '00000000-0000-0000-0000-000000000001'
),
(
  1002,
  'a1000000-0000-0000-0000-000000000001',
  1002,                                     -- Web Dev Basics
  1002,                                     -- Web Dev Starter (free)
  'active',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (enrollment_id) DO NOTHING;

SELECT setval('enrollments_enrollment_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 15. SUBSCRIPTION PLANS  (tenant-level — shown on /pricing)
-- plan_id 2001 = Code Academy Pro Monthly (30-day subscription)
-- ---------------------------------------------------------------------------
INSERT INTO plans (plan_id, plan_name, price, duration_in_days, description, features, currency, payment_provider, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(
  2001,
  'Code Academy Pro Monthly',
  19.00,
  30,
  'Full access to all Code Academy Pro courses for 30 days.',
  '["Unlimited course access","Certificate of completion","Priority support","Offline downloads"]',
  'usd',
  'stripe',
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (plan_id) DO NOTHING;

SELECT setval('plans_plan_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 15b. PLAN → COURSE LINKS  (handle_new_subscription enrolls via plan_courses)
-- ---------------------------------------------------------------------------
INSERT INTO plan_courses (plan_id, course_id)
VALUES
  (2001, 2001),  -- Code Academy Pro Monthly → Python for Beginners
  (2001, 2002)   -- Code Academy Pro Monthly → Data Analysis with Pandas
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 16. GAMIFICATION LEVELS & ACHIEVEMENTS  (renumbered from 15)
-- Already seeded by migration 20260216000001 — kept here for reset-safety
-- ---------------------------------------------------------------------------
INSERT INTO gamification_levels (level, min_xp, title, icon) VALUES
(1,0,'Newcomer','🥚'),(2,100,'Seeker','🐣'),(3,250,'Learner','🐥'),
(4,500,'Scholar','📖'),(5,850,'Apprentice','🔨'),(6,1300,'Novice','🕯️'),
(7,1900,'Student','📝'),(8,2600,'Practitioner','🧪'),(9,3400,'Specialist','🔍'),
(10,4300,'Adept','✨'),(11,5400,'Professional','💼'),(12,6700,'Expert','🎓'),
(13,8200,'Scholar-Elite','📜'),(14,10000,'Master','🏛️'),(15,12500,'Grandmaster','💎')
ON CONFLICT (level) DO UPDATE SET
  min_xp = EXCLUDED.min_xp, title = EXCLUDED.title, icon = EXCLUDED.icon;

INSERT INTO gamification_achievements (slug, title, description, tier, category, icon, xp_reward, condition_type, condition_value)
VALUES
('first_lesson',  'First Steps',         'Complete your first lesson',        'bronze','learning',    '🎯',50,  'lessons_completed',1),
('lesson_enthusiast','Knowledge Seeker', 'Complete 10 lessons',               'silver','learning',    '📚',200, 'lessons_completed',10),
('lesson_master', 'Scholar of the Year', 'Complete 50 lessons',               'gold',  'learning',    '🏛️',1000,'lessons_completed',50),
('first_perfect_exam','Perfectionist',   'Score 100 on any exam',             'silver','assessment',  '💯',300, 'perfect_exams',1),
('exam_veteran',  'Battle Tested',       'Complete 10 exams',                 'silver','assessment',  '🛡️',500, 'exams_submitted',10),
('exercise_wizard','Practice Makes Perfect','Complete 25 exercises',          'gold',  'assessment',  '🧙‍♂️',750,'exercises_completed',25),
('vocal_student', 'Voice of Reason',     'Post your first comment',           'bronze','social',      '💬',50,  'comments_posted',1),
('helpful_peer',  'Top Contributor',     'Receive 10 likes on comments',      'silver','social',      '🤝',400, 'likes_received',10),
('reviewer',      'Critical Thinker',    'Write 5 course reviews',            'bronze','social',      '⭐',150, 'reviews_written',5),
('week_streak',   'Consistency is Key',  'Maintain a 7-day streak',           'silver','streak',      '🔥',500, 'streak_days',7),
('month_streak',  'Unstoppable',         'Maintain a 30-day streak',          'gold',  'streak',      '⚡',2000,'streak_days',30),
('level_10',      'Double Digits',       'Reach level 10',                    'silver','progression', '🔟',500, 'level_reached',10)
ON CONFLICT (slug) DO UPDATE SET
  title=EXCLUDED.title, description=EXCLUDED.description, tier=EXCLUDED.tier,
  category=EXCLUDED.category, icon=EXCLUDED.icon, xp_reward=EXCLUDED.xp_reward,
  condition_type=EXCLUDED.condition_type, condition_value=EXCLUDED.condition_value;


-- ---------------------------------------------------------------------------
-- 16. GAMIFICATION PROFILES  (one per student)
-- ---------------------------------------------------------------------------
INSERT INTO gamification_profiles (user_id, total_xp, level, current_streak, tenant_id)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 250,  3, 2, '00000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000004', 500,  4, 5, '00000000-0000-0000-0000-000000000002')
ON CONFLICT (user_id, tenant_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 17. TENANT SETTINGS  (branding for Code Academy)
-- ---------------------------------------------------------------------------
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'site_name',     '{"value":"Code Academy Pro"}'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'primary_color', '{"value":"#7c3aed"}'::jsonb)
ON CONFLICT (tenant_id, setting_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 18. PLATFORM SUBSCRIPTIONS  (Code Academy is on Pro plan)
-- ---------------------------------------------------------------------------
INSERT INTO platform_subscriptions (tenant_id, plan_id, status, payment_method, interval, current_period_start, current_period_end, cancel_at_period_end)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  (SELECT plan_id FROM platform_plans WHERE slug = 'pro'),
  'active',
  'manual_transfer',
  'monthly',
  NOW(),
  NOW() + interval '30 days',
  false
)
ON CONFLICT (tenant_id) DO NOTHING;


-- ===========================================================================
-- CODE ACADEMY PRO — Rich Content Seed
-- Full "Python for Beginners" course with detailed lessons, AI tasks,
-- exercises, and an exam with questions.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 18. ADDITIONAL LESSONS for Python for Beginners (course 2001)
-- Existing: 2001 (Variables & Types, seq 1), 2002 (Control Flow, seq 2)
-- Adding: 2004-2008 (seq 3-7) — a complete learning path
-- ---------------------------------------------------------------------------
INSERT INTO lessons (id, course_id, title, description, content, sequence, status, tenant_id,
                     ai_task_description, ai_task_instructions)
OVERRIDING SYSTEM VALUE
VALUES
-- Lesson 3: Functions
(
  2004, 2001, 'Functions and Scope',
  'Define reusable functions, understand parameters, return values, and variable scope.',
  '# Functions and Scope

Functions let you organize code into reusable blocks. They are the building blocks of clean, maintainable programs.

## Defining Functions

```python
def greet(name: str, greeting: str = "Hello") -> str:
    """Return a personalized greeting."""
    return f"{greeting}, {name}!"

print(greet("Alice"))           # Hello, Alice!
print(greet("Bob", "Hey"))      # Hey, Bob!
```

## Parameters and Arguments

Python supports several parameter types:

```python
def create_profile(name, age, *, city="Unknown", active=True):
    """Keyword-only params after * force explicit naming."""
    return {"name": name, "age": age, "city": city, "active": active}

profile = create_profile("Alice", 30, city="Madrid")
```

### *args and **kwargs

```python
def log_event(event_type, *details, **metadata):
    print(f"[{event_type}] {'' — ''.join(details)}")
    for key, value in metadata.items():
        print(f"  {key}: {value}")

log_event("LOGIN", "user123", "success", ip="192.168.1.1", browser="Firefox")
```

## Variable Scope

Variables inside a function are **local** — they don''t affect the outside:

```python
total = 0

def add_to_total(amount):
    # This creates a LOCAL variable — does NOT modify the global
    total = amount
    return total

add_to_total(10)
print(total)  # Still 0!
```

To modify a global (use sparingly):
```python
def add_to_total(amount):
    global total
    total += amount
```

## Best Practices

1. **One function, one job** — if a function does two things, split it
2. **Use type hints** — they document intent and catch bugs early
3. **Return values > side effects** — prefer pure functions
4. **Keep functions short** — if it doesn''t fit on screen, refactor',
  3, 'published',
  '00000000-0000-0000-0000-000000000002',
  -- AI task: practice writing functions
  'Write a Python function called `calculate_stats` that takes a list of numbers and returns a dictionary with keys "mean", "median", "min", and "max". Then write a second function `filter_outliers` that removes values more than 2 standard deviations from the mean.',
  'You are a Python tutor evaluating the student''s understanding of functions.

Check their solution for:
1. **Correct function signatures** with type hints
2. **Proper return values** (dict for calculate_stats, list for filter_outliers)
3. **Edge cases** — empty list handling, single-element list
4. **Code quality** — docstrings, meaningful variable names, no unnecessary globals

Guide them with hints if they struggle. Do NOT give the full solution.
Mark the task complete when both functions work correctly and handle at least one edge case.
Award partial credit if only one function is correct.'
),
-- Lesson 4: Data Structures
(
  2005, 2001, 'Lists, Tuples, and Dictionaries',
  'Master Python''s core data structures and when to use each one.',
  '# Lists, Tuples, and Dictionaries

Choosing the right data structure is one of the most important decisions in programming.

## Lists — Ordered, Mutable

```python
# Creating and modifying
fruits = ["apple", "banana", "cherry"]
fruits.append("date")
fruits.insert(1, "avocado")
fruits.remove("banana")

# List comprehensions — the Pythonic way
squares = [x**2 for x in range(10)]
evens = [x for x in range(20) if x % 2 == 0]

# Nested comprehension
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flat = [num for row in matrix for num in row]
# [1, 2, 3, 4, 5, 6, 7, 8, 9]
```

## Tuples — Ordered, Immutable

Use tuples for data that shouldn''t change:

```python
# Coordinates, RGB colors, database rows
point = (3, 4)
color = (255, 128, 0)

# Tuple unpacking
x, y = point
r, g, b = color

# Named tuples for clarity
from collections import namedtuple
Student = namedtuple("Student", ["name", "grade", "age"])
alice = Student("Alice", "A", 20)
print(alice.name)  # Alice
```

## Dictionaries — Key-Value Pairs

```python
# Student grade book
grades = {
    "Alice": [95, 87, 92],
    "Bob": [78, 85, 90],
    "Carol": [88, 91, 96],
}

# Safe access with .get()
alice_grades = grades.get("Alice", [])
dave_grades = grades.get("Dave", [])  # Returns [] instead of KeyError

# Dictionary comprehension
averages = {name: sum(g) / len(g) for name, g in grades.items()}
# {"Alice": 91.33, "Bob": 84.33, "Carol": 91.67}
```

## When to Use What

| Structure | Use When |
|-----------|----------|
| **List** | Ordered collection that changes over time |
| **Tuple** | Fixed data, dictionary keys, function returns |
| **Dict** | Fast lookups by key, structured data |
| **Set** | Unique items, membership testing |',
  4, 'published',
  '00000000-0000-0000-0000-000000000002',
  'Build a simple contact book using dictionaries. Create functions to: (1) add a contact with name, phone, and email, (2) search contacts by partial name match, (3) list all contacts sorted alphabetically, (4) delete a contact by name. Use a list of dictionaries as your data store.',
  'You are a Python tutor focused on data structures.

Evaluate the student''s contact book implementation:
1. **Correct use of dictionaries** — each contact should be a dict with proper keys
2. **Search function** — should handle partial matches (case-insensitive)
3. **Sort function** — must use sorted() with a key function
4. **Delete function** — should handle "contact not found" gracefully
5. **Code organization** — functions should be well-named and focused

If the student uses a class instead of plain functions, that''s acceptable and shows initiative.
Mark complete when all 4 operations work correctly.
Bonus: acknowledge if they add input validation or duplicate detection.'
),
-- Lesson 5: File I/O
(
  2006, 2001, 'Working with Files',
  'Read and write files, handle CSV data, and manage resources with context managers.',
  '# Working with Files

Real programs need to read and write data. Python makes file handling elegant with context managers.

## Reading Files

```python
# Always use context managers (with statement)
with open("data.txt", "r") as f:
    content = f.read()        # Entire file as string

with open("data.txt", "r") as f:
    lines = f.readlines()     # List of lines

# Memory-efficient: iterate line by line
with open("large_file.txt", "r") as f:
    for line in f:
        process(line.strip())
```

## Writing Files

```python
# Write (overwrites existing content)
with open("output.txt", "w") as f:
    f.write("First line\n")
    f.write("Second line\n")

# Append (adds to end)
with open("log.txt", "a") as f:
    f.write(f"[{datetime.now()}] Event occurred\n")
```

## Working with CSV

```python
import csv

# Reading CSV
with open("students.csv", "r") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(f"{row[''name'']} scored {row[''grade'']}")

# Writing CSV
students = [
    {"name": "Alice", "grade": 95, "passed": True},
    {"name": "Bob", "grade": 67, "passed": False},
]

with open("results.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "grade", "passed"])
    writer.writeheader()
    writer.writerows(students)
```

## JSON Files

```python
import json

# Read JSON
with open("config.json", "r") as f:
    config = json.load(f)

# Write JSON (pretty-printed)
with open("config.json", "w") as f:
    json.dump(config, f, indent=2)
```

## Error Handling with Files

```python
from pathlib import Path

path = Path("data.txt")
if path.exists():
    content = path.read_text()
else:
    print("File not found")

# Or use try/except
try:
    with open("data.txt") as f:
        data = f.read()
except FileNotFoundError:
    data = ""
except PermissionError:
    print("Cannot read file — check permissions")
```',
  5, 'published',
  '00000000-0000-0000-0000-000000000002',
  NULL, NULL
),
-- Lesson 6: Error Handling
(
  2007, 2001, 'Error Handling and Debugging',
  'Write robust code with try/except, custom exceptions, and debugging techniques.',
  '# Error Handling and Debugging

Errors are inevitable. Good developers plan for them.

## Try / Except

```python
def safe_divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None
    except TypeError as e:
        print(f"Invalid types: {e}")
        return None
    finally:
        print("Division attempted")  # Always runs
```

## Common Exception Types

| Exception | When It Happens |
|-----------|-----------------|
| `ValueError` | Wrong value (e.g., `int("abc")`) |
| `TypeError` | Wrong type (e.g., `"2" + 2`) |
| `KeyError` | Missing dictionary key |
| `IndexError` | List index out of range |
| `FileNotFoundError` | File doesn''t exist |
| `AttributeError` | Object doesn''t have that method |

## Custom Exceptions

```python
class InsufficientFundsError(Exception):
    def __init__(self, balance, amount):
        self.balance = balance
        self.amount = amount
        super().__init__(
            f"Cannot withdraw ${amount:.2f} — "
            f"balance is only ${balance:.2f}"
        )

class BankAccount:
    def __init__(self, balance=0):
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise InsufficientFundsError(self.balance, amount)
        self.balance -= amount
        return self.balance

# Usage
account = BankAccount(100)
try:
    account.withdraw(150)
except InsufficientFundsError as e:
    print(e)  # Cannot withdraw $150.00 — balance is only $100.00
```

## Debugging Tips

1. **Read the traceback bottom-up** — the last line is the actual error
2. **Use `print()` debugging** for quick checks
3. **Use `breakpoint()`** for interactive debugging (Python 3.7+)
4. **Logging > print** for production code

```python
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def process_order(order_id):
    logger.info(f"Processing order {order_id}")
    try:
        result = charge_payment(order_id)
        logger.debug(f"Payment result: {result}")
    except PaymentError:
        logger.exception(f"Payment failed for order {order_id}")
```',
  6, 'published',
  '00000000-0000-0000-0000-000000000002',
  'Create a `BankAccount` class with methods `deposit(amount)`, `withdraw(amount)`, and `transfer(other_account, amount)`. Use custom exceptions for: insufficient funds, negative amounts, and invalid account. Write test cases that trigger each exception.',
  'You are a Python tutor evaluating error handling skills.

Check for:
1. **Custom exception classes** — at least 2 (InsufficientFunds, InvalidAmount)
2. **Proper exception hierarchy** — should inherit from Exception or a common base
3. **Meaningful error messages** with context (balance, amount, etc.)
4. **Try/except usage** in test cases — student should demonstrate catching exceptions
5. **Edge cases** — zero amounts, negative amounts, self-transfer

Do NOT accept bare `except:` clauses — they must catch specific exceptions.
Mark complete when the class works correctly and has at least 3 test cases demonstrating exception handling.
Bonus: acknowledge use of `__str__` or `__repr__` on custom exceptions.'
),
-- Lesson 7: Modules and Project Structure
(
  2008, 2001, 'Modules and Project Structure',
  'Organize code into modules, understand imports, and structure a Python project.',
  '# Modules and Project Structure

As programs grow, you need to organize code into separate files and packages.

## Importing Modules

```python
# Import entire module
import math
print(math.sqrt(16))  # 4.0

# Import specific items
from datetime import datetime, timedelta
now = datetime.now()
tomorrow = now + timedelta(days=1)

# Import with alias
import pandas as pd
import numpy as np
```

## Creating Your Own Modules

```
my_project/
├── main.py
├── utils/
│   ├── __init__.py
│   ├── validation.py
│   └── formatting.py
├── models/
│   ├── __init__.py
│   └── student.py
└── tests/
    └── test_validation.py
```

### utils/validation.py
```python
import re

def is_valid_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email))

def is_strong_password(password: str) -> bool:
    if len(password) < 8:
        return False
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    return has_upper and has_lower and has_digit
```

### main.py
```python
from utils.validation import is_valid_email, is_strong_password

email = input("Email: ")
if not is_valid_email(email):
    print("Invalid email format")
```

## The `__name__` Guard

```python
# This code only runs when the file is executed directly,
# not when imported as a module
def main():
    print("Running as main program")

if __name__ == "__main__":
    main()
```

## Virtual Environments

```bash
# Create a virtual environment
python -m venv .venv

# Activate it
source .venv/bin/activate    # macOS/Linux
.venv\\Scripts\\activate       # Windows

# Install packages
pip install requests pandas

# Save dependencies
pip freeze > requirements.txt

# Install from requirements
pip install -r requirements.txt
```

## Project Best Practices

1. **One module = one responsibility**
2. **Use `__init__.py`** to control public API
3. **Relative imports within packages**: `from .validation import is_valid_email`
4. **Always use virtual environments** — never install globally
5. **Pin dependency versions** in requirements.txt',
  7, 'published',
  '00000000-0000-0000-0000-000000000002',
  NULL, NULL
)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 19. LESSONS_AI_TASKS  (for lessons that have AI tasks)
-- These are the structured AI task records that power the chat interface
-- ---------------------------------------------------------------------------
INSERT INTO lessons_ai_tasks (id, lesson_id, task_instructions, system_prompt)
OVERRIDING SYSTEM VALUE
VALUES
(
  2001, 2004,
  'Write a Python function called `calculate_stats` that takes a list of numbers and returns a dictionary with keys "mean", "median", "min", and "max". Then write a second function `filter_outliers` that removes values more than 2 standard deviations from the mean.',
  'You are a Python tutor evaluating the student''s understanding of functions.

Check their solution for:
1. Correct function signatures with type hints
2. Proper return values (dict for calculate_stats, list for filter_outliers)
3. Edge cases — empty list handling, single-element list
4. Code quality — docstrings, meaningful variable names

Guide them with hints if they struggle. Do NOT give the full solution.
Mark the task complete when both functions work correctly and handle at least one edge case.'
),
(
  2002, 2005,
  'Build a simple contact book using dictionaries. Create functions to: add a contact, search by partial name, list all contacts sorted alphabetically, and delete a contact.',
  'You are a Python tutor focused on data structures.

Evaluate the student''s contact book implementation:
1. Correct use of dictionaries for each contact
2. Search function handles partial matches (case-insensitive)
3. Sort function uses sorted() with a key function
4. Delete function handles "not found" gracefully

Mark complete when all 4 operations work correctly.'
),
(
  2003, 2007,
  'Create a BankAccount class with deposit, withdraw, and transfer methods. Use custom exceptions for insufficient funds, negative amounts, and invalid accounts. Write test cases.',
  'You are a Python tutor evaluating error handling skills.

Check for:
1. Custom exception classes (at least 2)
2. Proper exception hierarchy (inherit from Exception)
3. Meaningful error messages with context
4. Try/except in test cases catching specific exceptions
5. Edge cases — zero amounts, negative amounts

Mark complete when the class works and has at least 3 test cases.'
)
ON CONFLICT (id) DO NOTHING;

SELECT setval('lessons_ai_tasks_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 20. EXERCISES — Code Academy Pro (course 2001: Python for Beginners)
-- Real coding exercises with AI-powered evaluation
-- ---------------------------------------------------------------------------
INSERT INTO exercises (id, course_id, lesson_id, title, description, instructions, exercise_type,
                       difficulty_level, system_prompt, status, created_by, tenant_id, time_limit)
OVERRIDING SYSTEM VALUE
VALUES
-- Exercise 1: FizzBuzz (classic, easy)
(
  2001, 2001, 2002,
  'FizzBuzz Challenge',
  'The classic programming interview question — a great test of control flow basics.',
  'Write a function `fizzbuzz(n: int) -> list[str]` that returns a list of strings from 1 to n where:
- Numbers divisible by 3 are replaced with "Fizz"
- Numbers divisible by 5 are replaced with "Buzz"
- Numbers divisible by both 3 and 5 are replaced with "FizzBuzz"
- All other numbers are converted to strings

Example:
```python
fizzbuzz(15)
# ["1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz",
#  "11", "Fizz", "13", "14", "FizzBuzz"]
```

**Requirements:**
- Handle n = 0 (return empty list)
- Handle negative n (return empty list)
- The function must return a list, not print values',
  'coding_challenge', 'easy',
  'You are a Python coding exercise evaluator. The student must implement FizzBuzz correctly.

Evaluate their solution on:
1. **Correctness (50%)**: Does fizzbuzz(15) produce the right output? Check divisibility logic order (15 must be "FizzBuzz" not "Fizz").
2. **Edge cases (20%)**: n=0 and negative n return []. n=1 returns ["1"].
3. **Code quality (20%)**: Clean logic, no redundant conditions. Using elif is better than nested ifs.
4. **Style (10%)**: Type hints, meaningful variable names.

Common mistakes to watch for:
- Checking divisible by 3 before checking divisible by 15 (wrong order)
- Returning integers instead of strings
- Off-by-one: range should be 1 to n inclusive

Provide specific feedback. If correct, suggest optimizations (e.g., dictionary-based approach for extensibility).',
  'published',
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  15
),
-- Exercise 2: List manipulation (medium)
(
  2002, 2001, 2005,
  'Data Pipeline: Student Grades',
  'Process real-world data using lists, dictionaries, and comprehensions.',
  'You have a list of student grade records. Build a data processing pipeline.

Given this data structure:
```python
students = [
    {"name": "Alice", "grades": [85, 92, 78, 95, 88]},
    {"name": "Bob", "grades": [72, 68, 74, 80, 65]},
    {"name": "Carol", "grades": [95, 98, 92, 97, 94]},
    {"name": "Dave", "grades": [60, 55, 70, 45, 58]},
    {"name": "Eve", "grades": [88, 85, 90, 87, 92]},
]
```

Implement these functions:

1. `calculate_averages(students) -> list[dict]`
   Returns each student with an added "average" key (rounded to 1 decimal).

2. `get_honor_roll(students, threshold=85.0) -> list[str]`
   Returns names of students whose average is >= threshold, sorted alphabetically.

3. `grade_distribution(students) -> dict[str, int]`
   Returns count of grades in each bracket: "A" (90-100), "B" (80-89), "C" (70-79), "D" (60-69), "F" (below 60).

4. `class_report(students) -> str`
   Returns a formatted multi-line report showing each student''s name, average, and letter grade.

**Constraints:**
- Use list/dict comprehensions where appropriate
- No external libraries (only built-in Python)',
  'coding_challenge', 'medium',
  'You are a Python exercise evaluator focused on data manipulation with core data structures.

Evaluate the solution:
1. **calculate_averages (25%)**: Must not modify the original list (create new dicts or copies). Average rounded to 1 decimal.
2. **get_honor_roll (25%)**: Must handle custom threshold. Alphabetical sort. Return empty list if nobody qualifies.
3. **grade_distribution (25%)**: All 5 brackets must be present even if count is 0. Grade boundaries must be correct (90+ = A, not 90-100 which excludes 100).
4. **class_report (15%)**: Readable formatted output. At minimum show name and average.
5. **Code quality (10%)**: Use of comprehensions, clean function signatures, type hints appreciated.

If they modify the original data in calculate_averages, point that out as a bug (side effects).
If they use f-strings for formatting, that''s good. If they use format() or %, suggest f-strings.',
  'published',
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  30
),
-- Exercise 3: OOP + Error handling (hard)
(
  2003, 2001, 2007,
  'Build a Task Manager',
  'Apply OOP and error handling to build a complete task management system.',
  'Build a task management system using classes and proper error handling.

**Requirements:**

1. Create a `Task` class with:
   - Properties: `title` (str), `description` (str), `priority` ("low", "medium", "high"), `completed` (bool), `created_at` (datetime)
   - Method `complete()` — marks the task as done
   - Method `__repr__` — shows `Task(title, priority, completed)`

2. Create a `TaskManager` class with:
   - `add_task(title, description, priority="medium") -> Task` — raises `ValueError` if title is empty or duplicate
   - `complete_task(title) -> Task` — raises `TaskNotFoundError` if title doesn''t exist
   - `get_tasks(priority=None, completed=None) -> list[Task]` — filter by priority and/or completion status
   - `summary() -> dict` — returns `{"total": N, "completed": N, "pending": N, "by_priority": {"low": N, "medium": N, "high": N}}`

3. Create a custom `TaskNotFoundError` exception with the missing title in the message.

**Example usage:**
```python
tm = TaskManager()
tm.add_task("Buy groceries", "Milk, eggs, bread", "high")
tm.add_task("Read chapter 5", "Python book")
tm.complete_task("Buy groceries")

pending = tm.get_tasks(completed=False)
high_priority = tm.get_tasks(priority="high")
print(tm.summary())
```

**Bonus:** Add a `sort_tasks(by="priority")` method that sorts by priority (high > medium > low) or by creation date.',
  'coding_challenge', 'hard',
  'You are a senior Python developer reviewing a student''s OOP implementation.

Evaluation rubric:
1. **Task class (20%)**: Proper __init__ with all fields, default values, __repr__ implementation. created_at should auto-set.
2. **TaskManager class (30%)**: All 4 methods implemented correctly. add_task returns the created Task. Filtering works with None params (returns all).
3. **Custom exception (15%)**: TaskNotFoundError inherits from Exception with informative message including the missing title.
4. **Error handling (15%)**: ValueError for empty/duplicate titles. Priority validation (only low/medium/high accepted).
5. **Code quality (10%)**: Type hints, docstrings, clean separation of concerns.
6. **Bonus sort_tasks (10%)**: Priority ordering uses a mapping dict, not string comparison.

Key things to check:
- get_tasks with both filters should AND them (not OR)
- summary counts must be consistent with actual task state
- complete_task on already-completed task: acceptable to either no-op or raise

Give constructive feedback. Praise good patterns (dataclasses, enums, property decorators).',
  'published',
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  45
),
-- Exercise 4: Essay type (medium)
(
  2004, 2001, 2008,
  'Python in Practice: Design Decisions',
  'Reflect on Python design philosophy and real-world trade-offs.',
  'Write a short essay (200-400 words) addressing the following question:

**"Python is often described as a language that prioritizes readability over performance. Do you agree? Discuss with specific examples."**

Your essay should:
1. State your position clearly in the opening paragraph
2. Give at least 2 concrete Python features that support your argument (e.g., list comprehensions, GIL, dynamic typing, indentation-as-syntax)
3. Acknowledge a counterargument — when might Python''s philosophy be a disadvantage?
4. Conclude with your view on when Python is the right tool and when it isn''t

**Evaluation criteria:**
- Clarity of argument
- Specific technical examples (not vague generalities)
- Balanced perspective
- Writing quality',
  'essay', 'medium',
  'You are a computer science educator evaluating a student''s essay on Python design philosophy.

Rubric:
1. **Thesis clarity (25%)**: Is their position stated clearly? Do they actually take a stance?
2. **Technical examples (30%)**: At least 2 specific Python features discussed. Generic statements like "Python is easy" without specifics score low. Good examples: list comprehensions vs C-style loops, GIL limitations, duck typing, The Zen of Python, significant whitespace.
3. **Counterargument (20%)**: Do they acknowledge trade-offs? Performance-critical applications, type safety, the GIL for parallelism, etc.
4. **Writing quality (15%)**: Well-organized, clear prose, proper paragraphs. Technical writing should be precise.
5. **Conclusion (10%)**: Thoughtful wrap-up that connects back to thesis.

Be encouraging but honest. Quote specific sentences that are strong or need improvement.
Do NOT accept essays under 150 words or those that are clearly AI-generated boilerplate.',
  'published',
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  30
)
ON CONFLICT (id) DO NOTHING;

SELECT setval('exercises_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 21. EXAM — Python for Beginners Final Assessment
-- ---------------------------------------------------------------------------
INSERT INTO exams (exam_id, course_id, title, description, exam_date, duration, status, sequence, created_by, tenant_id)
OVERRIDING SYSTEM VALUE
VALUES
(
  2001, 2001,
  'Python Fundamentals — Final Exam',
  'Comprehensive assessment covering variables, control flow, functions, data structures, file I/O, and error handling. 60 minutes, 10 questions.',
  '2026-12-31 23:59:00+00',
  60,
  'published',
  1,
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (exam_id) DO NOTHING;

SELECT setval('exams_exam_id_seq', 10000, false);

-- Exam questions
INSERT INTO exam_questions (question_id, exam_id, question_text, question_type)
OVERRIDING SYSTEM VALUE
VALUES
-- True/False
(2001, 2001, 'In Python, variables declared inside a function are accessible outside that function by default.', 'true_false'),
(2002, 2001, 'A tuple can be used as a dictionary key, but a list cannot.', 'true_false'),
-- Multiple Choice
(2003, 2001, 'What is the output of: print(type([]) == type(()))?', 'multiple_choice'),
(2004, 2001, 'Which of the following correctly handles a file using a context manager?', 'multiple_choice'),
(2005, 2001, 'What happens when you access a key that doesn''t exist in a dictionary using square bracket notation?', 'multiple_choice'),
(2006, 2001, 'What is the result of [x**2 for x in range(5) if x % 2 != 0]?', 'multiple_choice'),
-- Free Text
(2007, 2001, 'Explain the difference between a list and a tuple in Python. When would you choose one over the other? Give a practical example for each.', 'free_text'),
(2008, 2001, 'Write a Python function called `count_words(text: str) -> dict[str, int]` that takes a string and returns a dictionary mapping each word (lowercased) to its frequency. Explain your approach.', 'free_text'),
(2009, 2001, 'What are the benefits of using try/except blocks instead of checking conditions with if statements? Describe the EAFP principle and give an example.', 'free_text'),
(2010, 2001, 'Describe how you would structure a Python project with multiple modules. What is the purpose of __init__.py and the if __name__ == "__main__" guard?', 'free_text')
ON CONFLICT (question_id) DO NOTHING;

SELECT setval('exam_questions_question_id_seq', 10000, false);

-- Question options (for true_false and multiple_choice)
INSERT INTO question_options (option_id, question_id, option_text, is_correct)
OVERRIDING SYSTEM VALUE
VALUES
-- Q2001: Variables in function scope (True/False) → False
(2001, 2001, 'True', false),
(2002, 2001, 'False', true),
-- Q2002: Tuple as dict key (True/False) → True
(2003, 2002, 'True', true),
(2004, 2002, 'False', false),
-- Q2003: type([]) == type(()) → False
(2005, 2003, 'True', false),
(2006, 2003, 'False', true),
(2007, 2003, 'TypeError — you cannot compare types', false),
(2008, 2003, 'None', false),
-- Q2004: Context manager
(2009, 2004, 'f = open("file.txt"); data = f.read(); f.close()', false),
(2010, 2004, 'with open("file.txt") as f: data = f.read()', true),
(2011, 2004, 'try: f = open("file.txt") except: pass', false),
(2012, 2004, 'open("file.txt").read()', false),
-- Q2005: Missing dict key → KeyError
(2013, 2005, 'It returns None', false),
(2014, 2005, 'It returns an empty string', false),
(2015, 2005, 'It raises a KeyError', true),
(2016, 2005, 'It creates the key with a default value', false),
-- Q2006: [x**2 for x in range(5) if x % 2 != 0] → [1, 9]
(2017, 2006, '[1, 4, 9, 16]', false),
(2018, 2006, '[0, 4, 16]', false),
(2019, 2006, '[1, 9]', true),
(2020, 2006, '[1, 3]', false)
ON CONFLICT (option_id) DO NOTHING;

SELECT setval('question_options_option_id_seq', 10000, false);
