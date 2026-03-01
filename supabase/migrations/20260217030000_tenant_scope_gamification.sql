-- =============================================================================
-- Migration: Tenant-Scoped Gamification
-- Makes gamification multi-tenant aware and adds plan-based feature gating
-- =============================================================================

-- =============================================================================
-- STEP 1: Add tenant_id to 7 gamification tables (nullable first, then backfill)
-- =============================================================================

-- 1. gamification_profiles
ALTER TABLE gamification_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE gamification_profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE gamification_profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gamification_profiles DROP CONSTRAINT IF EXISTS gamification_profiles_user_id_key;
ALTER TABLE gamification_profiles ADD CONSTRAINT gamification_profiles_user_tenant_unique UNIQUE (user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_gamification_profiles_tenant ON gamification_profiles(tenant_id);

-- 2. gamification_xp_transactions
ALTER TABLE gamification_xp_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE gamification_xp_transactions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE gamification_xp_transactions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gamification_xp_transactions_tenant ON gamification_xp_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gamification_xp_transactions_user_tenant ON gamification_xp_transactions(user_id, tenant_id);

-- 3. gamification_user_achievements
ALTER TABLE gamification_user_achievements ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE gamification_user_achievements SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE gamification_user_achievements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gamification_user_achievements DROP CONSTRAINT IF EXISTS gamification_user_achievements_user_id_achievement_id_key;
ALTER TABLE gamification_user_achievements ADD CONSTRAINT gamification_user_achievements_user_achievement_tenant_unique UNIQUE (user_id, achievement_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_gamification_user_achievements_tenant ON gamification_user_achievements(tenant_id);

-- 4. gamification_leaderboard_cache
ALTER TABLE gamification_leaderboard_cache ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE gamification_leaderboard_cache SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE gamification_leaderboard_cache ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gamification_leaderboard_cache DROP CONSTRAINT IF EXISTS gamification_leaderboard_cache_user_id_key;
ALTER TABLE gamification_leaderboard_cache ADD CONSTRAINT gamification_leaderboard_cache_user_tenant_unique UNIQUE (user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_gamification_leaderboard_cache_tenant ON gamification_leaderboard_cache(tenant_id);

-- 5. gamification_redemptions
ALTER TABLE gamification_redemptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE gamification_redemptions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE gamification_redemptions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gamification_redemptions_tenant ON gamification_redemptions(tenant_id);

-- 6. gamification_user_rewards
ALTER TABLE gamification_user_rewards ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE gamification_user_rewards SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE gamification_user_rewards ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gamification_user_rewards_tenant ON gamification_user_rewards(tenant_id);

-- 7. gamification_challenge_participants
ALTER TABLE gamification_challenge_participants ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE gamification_challenge_participants SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE gamification_challenge_participants ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gamification_challenge_participants DROP CONSTRAINT IF EXISTS gamification_challenge_participants_user_id_challenge_id_key;
ALTER TABLE gamification_challenge_participants ADD CONSTRAINT gamification_challenge_participants_user_challenge_tenant_unique UNIQUE (user_id, challenge_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_gamification_challenge_participants_tenant ON gamification_challenge_participants(tenant_id);

-- =============================================================================
-- STEP 2: Add optional tenant_id to definition tables (for custom items)
-- =============================================================================

-- NULL = global (platform default), UUID = school-specific custom
ALTER TABLE gamification_achievements ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_gamification_achievements_tenant ON gamification_achievements(tenant_id);

ALTER TABLE gamification_store_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_gamification_store_items_tenant ON gamification_store_items(tenant_id);

-- =============================================================================
-- STEP 3: Update RLS policies for tenant scoping
-- =============================================================================

-- gamification_profiles
DROP POLICY IF EXISTS "Users can view own gamification profile" ON gamification_profiles;
DROP POLICY IF EXISTS "Anyone can view profiles for leaderboard" ON gamification_profiles;
DROP POLICY IF EXISTS "Users can update own gamification profile" ON gamification_profiles;

CREATE POLICY "Users can view own tenant gamification profile"
  ON gamification_profiles FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Anyone can view tenant profiles for leaderboard"
  ON gamification_profiles FOR SELECT
  USING (tenant_id = get_tenant_id());

-- gamification_xp_transactions
DROP POLICY IF EXISTS "Users can view own XP transactions" ON gamification_xp_transactions;

CREATE POLICY "Users can view own tenant XP transactions"
  ON gamification_xp_transactions FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

-- gamification_user_achievements
DROP POLICY IF EXISTS "Users can view own achievements" ON gamification_user_achievements;
DROP POLICY IF EXISTS "Anyone can view earned achievements" ON gamification_user_achievements;

CREATE POLICY "Users can view own tenant achievements"
  ON gamification_user_achievements FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

CREATE POLICY "Anyone can view tenant earned achievements"
  ON gamification_user_achievements FOR SELECT
  USING (tenant_id = get_tenant_id());

-- gamification_leaderboard_cache
DROP POLICY IF EXISTS "Anyone can view the leaderboard" ON gamification_leaderboard_cache;

CREATE POLICY "Anyone can view tenant leaderboard"
  ON gamification_leaderboard_cache FOR SELECT
  USING (tenant_id = get_tenant_id());

-- gamification_redemptions
DROP POLICY IF EXISTS "Users can view own redemptions" ON gamification_redemptions;

CREATE POLICY "Users can view own tenant redemptions"
  ON gamification_redemptions FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

-- gamification_user_rewards
DROP POLICY IF EXISTS "Users can view own rewards" ON gamification_user_rewards;

CREATE POLICY "Users can view own tenant rewards"
  ON gamification_user_rewards FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

-- gamification_challenge_participants
DROP POLICY IF EXISTS "Users can view own challenges" ON gamification_challenge_participants;

CREATE POLICY "Users can view own tenant challenges"
  ON gamification_challenge_participants FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = get_tenant_id());

-- gamification_achievements: show global + tenant-specific
DROP POLICY IF EXISTS "Anyone can view active achievements" ON gamification_achievements;

CREATE POLICY "Anyone can view global and tenant achievements"
  ON gamification_achievements FOR SELECT
  USING (is_active = true AND (tenant_id IS NULL OR tenant_id = get_tenant_id()));

-- gamification_store_items: show global + tenant-specific
DROP POLICY IF EXISTS "Anyone can view available store items" ON gamification_store_items;

CREATE POLICY "Anyone can view global and tenant store items"
  ON gamification_store_items FOR SELECT
  USING (is_available = true AND (tenant_id IS NULL OR tenant_id = get_tenant_id()));

-- =============================================================================
-- STEP 4: Update award_xp() to accept tenant_id
-- =============================================================================

CREATE OR REPLACE FUNCTION public.award_xp(
  _user_id UUID,
  _action_type TEXT,
  _xp_amount INT,
  _reference_id TEXT DEFAULT NULL,
  _reference_type TEXT DEFAULT NULL,
  _tenant_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_today DATE := CURRENT_DATE;
  v_last_activity DATE;
  v_current_streak INT;
  v_longest_streak INT;
  v_new_total_xp INT;
  v_new_level INT;
BEGIN
  -- Resolve tenant_id: parameter > JWT > default
  v_tenant_id := COALESCE(
    _tenant_id,
    (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );

  -- Insert XP transaction
  INSERT INTO gamification_xp_transactions (user_id, action_type, xp_amount, reference_id, reference_type, tenant_id)
  VALUES (_user_id, _action_type, _xp_amount, _reference_id, _reference_type, v_tenant_id);

  -- Upsert gamification profile keyed on (user_id, tenant_id)
  INSERT INTO gamification_profiles (user_id, tenant_id, total_xp, level, current_streak, longest_streak, last_activity_date, updated_at)
  VALUES (_user_id, v_tenant_id, _xp_amount, 1, 1, 1, v_today, NOW())
  ON CONFLICT (user_id, tenant_id)
  DO UPDATE SET
    total_xp = gamification_profiles.total_xp + _xp_amount,
    updated_at = NOW();

  -- Get current profile state
  SELECT total_xp, last_activity_date, current_streak, longest_streak
  INTO v_new_total_xp, v_last_activity, v_current_streak, v_longest_streak
  FROM gamification_profiles
  WHERE user_id = _user_id AND tenant_id = v_tenant_id;

  -- Update streak logic
  IF v_last_activity IS NULL OR v_last_activity < v_today THEN
    IF v_last_activity = v_today - INTERVAL '1 day' THEN
      -- Consecutive day
      v_current_streak := COALESCE(v_current_streak, 0) + 1;
    ELSIF v_last_activity IS NULL OR v_last_activity < v_today - INTERVAL '1 day' THEN
      -- Streak broken (or first activity)
      v_current_streak := 1;
    END IF;

    IF v_current_streak > v_longest_streak THEN
      v_longest_streak := v_current_streak;
    END IF;

    UPDATE gamification_profiles
    SET current_streak = v_current_streak,
        longest_streak = v_longest_streak,
        last_activity_date = v_today
    WHERE user_id = _user_id AND tenant_id = v_tenant_id;
  END IF;

  -- Auto-level based on XP thresholds
  SELECT level INTO v_new_level
  FROM gamification_levels
  WHERE min_xp <= v_new_total_xp
  ORDER BY level DESC
  LIMIT 1;

  IF v_new_level IS NOT NULL THEN
    UPDATE gamification_profiles
    SET level = v_new_level
    WHERE user_id = _user_id AND tenant_id = v_tenant_id AND level < v_new_level;
  END IF;
END;
$$;

-- =============================================================================
-- STEP 5: Remove handle_new_gamification_profile trigger
-- Profiles are now created lazily by award_xp() per tenant
-- =============================================================================

DROP TRIGGER IF EXISTS on_profile_created_gamification ON profiles;
DROP FUNCTION IF EXISTS handle_new_gamification_profile();

-- =============================================================================
-- STEP 6: Update XP trigger functions to pass tenant_id
-- =============================================================================

-- Trigger: lesson_completions -> award XP
CREATE OR REPLACE FUNCTION handle_lesson_completion_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- lesson_completions has tenant_id directly
  v_tenant_id := NEW.tenant_id;

  IF v_tenant_id IS NULL THEN
    -- Fallback: look up from lessons -> courses
    SELECT c.tenant_id INTO v_tenant_id
    FROM lessons l
    JOIN courses c ON c.course_id = l.course_id
    WHERE l.lesson_id = NEW.lesson_id;
  END IF;

  PERFORM award_xp(NEW.user_id, 'lesson_completion', 100, NEW.lesson_id::text, 'lesson', v_tenant_id);
  RETURN NEW;
END;
$$;

-- Trigger: exam_submissions -> award XP
CREATE OR REPLACE FUNCTION handle_exam_submission_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_xp INT := 200;
  v_tenant_id UUID;
BEGIN
  -- exam_submissions has tenant_id directly
  v_tenant_id := NEW.tenant_id;

  IF v_tenant_id IS NULL THEN
    -- Fallback: look up from exams -> courses
    SELECT c.tenant_id INTO v_tenant_id
    FROM exams e
    JOIN courses c ON c.course_id = e.course_id
    WHERE e.exam_id = NEW.exam_id;
  END IF;

  -- Bonus for high scores
  IF NEW.score IS NOT NULL AND NEW.score >= 80 THEN
    v_xp := v_xp + 50;
  END IF;
  IF NEW.score IS NOT NULL AND NEW.score >= 100 THEN
    v_xp := v_xp + 100;
  END IF;

  PERFORM award_xp(NEW.student_id, 'exam_submission', v_xp, NEW.submission_id::text, 'exam', v_tenant_id);
  RETURN NEW;
END;
$$;

-- Trigger: exercise_completions -> award XP
CREATE OR REPLACE FUNCTION handle_exercise_completion_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Look up tenant from exercises -> lessons -> courses
  SELECT c.tenant_id INTO v_tenant_id
  FROM exercises e
  JOIN lessons l ON l.lesson_id = e.lesson_id
  JOIN courses c ON c.course_id = l.course_id
  WHERE e.id = NEW.exercise_id;

  PERFORM award_xp(NEW.user_id, 'exercise_completion', 50, NEW.exercise_id::text, 'exercise', v_tenant_id);
  RETURN NEW;
END;
$$;

-- Trigger: lesson_comments -> award XP
CREATE OR REPLACE FUNCTION handle_comment_posted_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Look up tenant from lessons -> courses
  SELECT c.tenant_id INTO v_tenant_id
  FROM lessons l
  JOIN courses c ON c.course_id = l.course_id
  WHERE l.lesson_id = NEW.lesson_id;

  PERFORM award_xp(NEW.user_id, 'comment_posted', 10, NEW.id::text, 'comment', v_tenant_id);
  RETURN NEW;
END;
$$;

-- Trigger: reviews -> award XP
CREATE OR REPLACE FUNCTION handle_review_posted_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Look up tenant from courses
  SELECT c.tenant_id INTO v_tenant_id
  FROM courses c
  WHERE c.course_id = NEW.course_id;

  PERFORM award_xp(NEW.user_id, 'course_review', 50, NEW.review_id::text, 'review', v_tenant_id);
  RETURN NEW;
END;
$$;

-- =============================================================================
-- STEP 7: Update refresh_leaderboard_cache() for tenant-scoped rankings
-- =============================================================================

CREATE OR REPLACE FUNCTION refresh_leaderboard_cache()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clear and rebuild with per-tenant rankings
  TRUNCATE gamification_leaderboard_cache;

  INSERT INTO gamification_leaderboard_cache (user_id, tenant_id, full_name, avatar_url, total_xp, level, rank, updated_at)
  SELECT
    gp.user_id,
    gp.tenant_id,
    p.full_name,
    p.avatar_url,
    gp.total_xp,
    gp.level,
    ROW_NUMBER() OVER (PARTITION BY gp.tenant_id ORDER BY gp.total_xp DESC)::int AS rank,
    NOW()
  FROM gamification_profiles gp
  JOIN profiles p ON p.id = gp.user_id
  WHERE gp.total_xp > 0
  ORDER BY gp.tenant_id, gp.total_xp DESC;

  -- Keep only top 1000 per tenant
  DELETE FROM gamification_leaderboard_cache
  WHERE rank > 1000;
END;
$$;

-- =============================================================================
-- STEP 8: Plan-gated gamification features
-- =============================================================================

CREATE OR REPLACE FUNCTION get_gamification_features(_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT plan INTO v_plan FROM tenants WHERE id = _tenant_id;

  RETURN CASE v_plan
    WHEN 'enterprise' THEN '{"xp":true,"levels":true,"streaks":true,"leaderboard":true,"achievements":true,"store":true,"custom_achievements":true,"custom_store":true}'::jsonb
    WHEN 'professional' THEN '{"xp":true,"levels":true,"streaks":true,"leaderboard":true,"achievements":true,"store":true,"custom_achievements":true,"custom_store":true}'::jsonb
    WHEN 'basic' THEN '{"xp":true,"levels":true,"streaks":true,"leaderboard":true,"achievements":true,"store":false,"custom_achievements":false,"custom_store":false}'::jsonb
    ELSE '{"xp":true,"levels":true,"streaks":true,"leaderboard":false,"achievements":false,"store":false,"custom_achievements":false,"custom_store":false}'::jsonb
  END;
END;
$$;
