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
INSERT INTO tenants (id, slug, name, primary_color, secondary_color, plan, status)
VALUES ('00000000-0000-0000-0000-000000000002', 'code-academy', 'Code Academy Pro', '#7c3aed', '#2563eb', 'pro', 'active')
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
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Test Student"}'::jsonb,
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
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"School Owner"}'::jsonb,
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
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Code Academy Creator"}'::jsonb,
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
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Alice Student"}'::jsonb,
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
INSERT INTO profiles (id, full_name, username)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Test Student',          'test_student'),
  ('a1000000-0000-0000-0000-000000000002', 'School Owner',          'school_owner'),
  ('a1000000-0000-0000-0000-000000000003', 'Code Academy Creator',  'ca_creator'),
  ('a1000000-0000-0000-0000-000000000004', 'Alice Student',         'alice_student')
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
-- ---------------------------------------------------------------------------
INSERT INTO product_courses (product_id, course_id)
VALUES
  (1001, 1001),  -- Testing Package → Intro to Testing
  (1002, 1002),  -- Web Dev Starter → Web Dev Basics
  (2001, 2001),  -- Python Bundle → Python for Beginners
  (2001, 2002),  -- Python Bundle → Data Analysis (one product → two courses)
  (2002, 2001),  -- Monthly plan → Python for Beginners
  (2002, 2002)   -- Monthly plan → Data Analysis
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 14. ENROLLMENTS
-- student@e2etest.com enrolled in Default School courses
-- alice@student.com   enrolled in Code Academy courses
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
),
(
  2001,
  'a1000000-0000-0000-0000-000000000004',  -- alice@student.com
  2001,                                     -- Python for Beginners
  2001,                                     -- Python Mastery Bundle
  'active',
  '00000000-0000-0000-0000-000000000002'
),
(
  2002,
  'a1000000-0000-0000-0000-000000000004',
  2002,                                     -- Data Analysis with Pandas
  2001,
  'active',
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (enrollment_id) DO NOTHING;

SELECT setval('enrollments_enrollment_id_seq', 10000, false);


-- ---------------------------------------------------------------------------
-- 15. GAMIFICATION LEVELS & ACHIEVEMENTS
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
ON CONFLICT (user_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 17. TENANT SETTINGS  (branding for Code Academy)
-- ---------------------------------------------------------------------------
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'site_name',     '{"value":"Code Academy Pro"}'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'primary_color', '{"value":"#7c3aed"}'::jsonb)
ON CONFLICT (tenant_id, setting_key) DO NOTHING;
