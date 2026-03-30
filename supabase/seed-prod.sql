-- =============================================================================
-- LMS — Minimal Production Seed
-- Run on cloud DB via: supabase db execute --file supabase/seed-prod.sql
--
-- Creates:
--   1. Platform plans (free/starter/pro/business/enterprise)
--   2. Default tenant
--   3. Admin account: owner@e2etest.com / password123
--   4. Gamification levels & achievements
--   5. Course categories
--
-- Safe to re-run (all ON CONFLICT DO NOTHING / DO UPDATE)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. CLEAN SLATE — truncate all data, skip tables that don't exist
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _tbl text;
BEGIN
  SET session_replication_role = 'replica';

  -- List every table we want to clear (order doesn't matter with CASCADE)
  FOREACH _tbl IN ARRAY ARRAY[
    -- gamification
    'gamification_profiles','xp_transactions','user_achievements',
    'redemptions','challenge_participants','leaderboard_cache',
    'daily_caps','user_rewards',
    -- progress
    'exam_submissions','lesson_completions','enrollments',
    -- content links
    'product_courses','plan_courses',
    -- content
    'lessons','exercises','exams','exam_questions','question_options',
    'courses',
    -- commerce
    'products','plans','subscriptions','transactions','payment_requests',
    'revenue_splits','payouts','invoices',
    'platform_subscriptions','platform_payment_requests',
    -- community
    'community_posts','community_comments','community_reactions',
    'community_polls','community_poll_votes','community_spaces',
    -- certificates
    'certificates','certificate_templates',
    -- notifications
    'user_notifications','notifications','notification_preferences',
    -- tenancy & users
    'tenant_users','tenant_settings','super_admins','tenant_invitations',
    'user_roles','profiles','tenants',
    -- landing pages
    'landing_pages',
    -- other
    'content_versions','mcp_audit_log','mcp_api_tokens'
  ]
  LOOP
    BEGIN
      EXECUTE format('TRUNCATE %I CASCADE', _tbl);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Skipping missing table: %', _tbl;
    END;
  END LOOP;

  -- Auth tables (always exist in Supabase)
  TRUNCATE auth.identities CASCADE;
  TRUNCATE auth.sessions CASCADE;
  TRUNCATE auth.refresh_tokens CASCADE;
  BEGIN TRUNCATE auth.mfa_factors CASCADE; EXCEPTION WHEN undefined_table THEN NULL; END;
  DELETE FROM auth.users;

  SET session_replication_role = 'origin';
END $$;


-- ---------------------------------------------------------------------------
-- 1. PLATFORM PLANS
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
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  transaction_fee_percent = EXCLUDED.transaction_fee_percent,
  sort_order = EXCLUDED.sort_order, features = EXCLUDED.features, limits = EXCLUDED.limits;


-- ---------------------------------------------------------------------------
-- 2. DEFAULT TENANT
-- ---------------------------------------------------------------------------
INSERT INTO tenants (id, slug, name, primary_color, secondary_color, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default School', '#2563eb', '#7c3aed', 'free', 'active')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. ADMIN USER: owner@e2etest.com / password123
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated',
  'owner@e2etest.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,
  '{"full_name":"School Owner","preferred_tenant_id":"00000000-0000-0000-0000-000000000001"}'::jsonb,
  now(), now(), '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- Identity (required for email/password login)
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002',
  '{"sub":"a1000000-0000-0000-0000-000000000002","email":"owner@e2etest.com"}'::jsonb,
  'email', 'owner@e2etest.com', now(), now(), now()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- Profile
INSERT INTO profiles (id, full_name, username, onboarding_completed)
VALUES ('a1000000-0000-0000-0000-000000000002', 'School Owner', 'school_owner', true)
ON CONFLICT (id) DO NOTHING;

-- Global role
INSERT INTO user_roles (user_id, role)
VALUES ('a1000000-0000-0000-0000-000000000002', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Tenant membership (admin of Default School)
INSERT INTO tenant_users (tenant_id, user_id, role, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'admin', 'active')
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Super admin
INSERT INTO super_admins (user_id)
VALUES ('a1000000-0000-0000-0000-000000000002')
ON CONFLICT (user_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. COURSE CATEGORIES
-- ---------------------------------------------------------------------------
INSERT INTO course_categories (name, description)
VALUES
  ('Programming',  'Learn to code in various programming languages'),
  ('Design',       'Master design principles and tools'),
  ('Business',     'Business and entrepreneurship courses'),
  ('Data Science', 'Data analysis, ML, and statistics')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. GAMIFICATION LEVELS
-- ---------------------------------------------------------------------------
INSERT INTO gamification_levels (level, min_xp, title, icon) VALUES
(1,0,'Newcomer','🥚'),(2,100,'Seeker','🐣'),(3,250,'Learner','🐥'),
(4,500,'Scholar','📖'),(5,850,'Apprentice','🔨'),(6,1300,'Novice','🕯️'),
(7,1900,'Student','📝'),(8,2600,'Practitioner','🧪'),(9,3400,'Specialist','🔍'),
(10,4300,'Adept','✨'),(11,5400,'Professional','💼'),(12,6700,'Expert','🎓'),
(13,8200,'Scholar-Elite','📜'),(14,10000,'Master','🏛️'),(15,12500,'Grandmaster','💎')
ON CONFLICT (level) DO UPDATE SET
  min_xp = EXCLUDED.min_xp, title = EXCLUDED.title, icon = EXCLUDED.icon;


-- ---------------------------------------------------------------------------
-- 6. GAMIFICATION ACHIEVEMENTS
-- ---------------------------------------------------------------------------
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
-- 7. RESET SEQUENCES
-- ---------------------------------------------------------------------------
SELECT setval('courses_course_id_seq', 1, false);
SELECT setval('lessons_id_seq', 1, false);
SELECT setval('products_product_id_seq', 1, false);
SELECT setval('enrollments_enrollment_id_seq', 1, false);
SELECT setval('plans_plan_id_seq', 1, false);


-- ---------------------------------------------------------------------------
-- Done! Log in at /auth with owner@e2etest.com / password123
-- You'll land on /dashboard/admin as super admin of Default School
-- ---------------------------------------------------------------------------
