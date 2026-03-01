-- Gamification System Core Tables and Logic

-- 1. Levels
CREATE TABLE IF NOT EXISTS public.gamification_levels (
    level INTEGER PRIMARY KEY,
    min_xp INTEGER NOT NULL,
    title TEXT NOT NULL,
    icon TEXT,
    perks JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE public.gamification_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view levels" ON public.gamification_levels FOR SELECT USING (true);

-- 2. Achievements Definition
CREATE TABLE IF NOT EXISTS public.gamification_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
    category TEXT NOT NULL,
    icon TEXT,
    xp_reward INTEGER NOT NULL DEFAULT 0,
    coin_reward INTEGER NOT NULL DEFAULT 0,
    condition_type TEXT NOT NULL,
    condition_value INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gamification_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active achievements" ON public.gamification_achievements FOR SELECT USING (is_active = true);

-- 3. Gamification Profiles
CREATE TABLE IF NOT EXISTS public.gamification_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1 REFERENCES public.gamification_levels(level),
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    streak_freezes_available INTEGER DEFAULT 0,
    total_coins_spent INTEGER DEFAULT 0,
    last_activity_date DATE,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gamification_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own gamification profile" ON public.gamification_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view gamification profiles for leaderboards" ON public.gamification_profiles FOR SELECT USING (true);

-- 4. User Achievements
CREATE TABLE IF NOT EXISTS public.gamification_user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES public.gamification_achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, achievement_id)
);

ALTER TABLE public.gamification_user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own achievements" ON public.gamification_user_achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view earned achievements" ON public.gamification_user_achievements FOR SELECT USING (true);

-- 5. XP Transactions
CREATE TABLE IF NOT EXISTS public.gamification_xp_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    xp_amount INTEGER NOT NULL,
    reference_id TEXT,
    reference_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gamification_xp_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own transactions" ON public.gamification_xp_transactions FOR SELECT USING (auth.uid() = user_id);

-- 6. Store Items
CREATE TABLE IF NOT EXISTS public.gamification_store_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_coins INTEGER NOT NULL,
    icon TEXT,
    category TEXT NOT NULL CHECK (category IN ('power_up', 'cosmetic', 'badge')),
    max_per_user INTEGER,
    is_available BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gamification_store_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view available store items" ON public.gamification_store_items FOR SELECT USING (is_available = true);

-- 7. Redemptions
CREATE TABLE IF NOT EXISTS public.gamification_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.gamification_store_items(id) ON DELETE CASCADE,
    coins_spent INTEGER NOT NULL,
    redeemed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gamification_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own redemptions" ON public.gamification_redemptions FOR SELECT USING (auth.uid() = user_id);

-- 8. User Rewards (Active items like double XP)
CREATE TABLE IF NOT EXISTS public.gamification_user_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reward_type TEXT NOT NULL,
    reward_data JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gamification_user_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own rewards" ON public.gamification_user_rewards FOR SELECT USING (auth.uid() = user_id);

-- 9. Leaderboard Cache
CREATE TABLE IF NOT EXISTS public.gamification_leaderboard_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    total_xp INTEGER NOT NULL,
    level INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gamification_leaderboard_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view the leaderboard" ON public.gamification_leaderboard_cache FOR SELECT USING (true);

-- 10. Challenge Participants
CREATE TABLE IF NOT EXISTS public.gamification_challenge_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL, -- Assuming a challenges table exists or will exist
    completed_at TIMESTAMPTZ,
    UNIQUE(user_id, challenge_id)
);

ALTER TABLE public.gamification_challenge_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own challenges" ON public.gamification_challenge_participants FOR SELECT USING (auth.uid() = user_id);

--- FUNCTIONS ---

-- Award XP Function
CREATE OR REPLACE FUNCTION public.award_xp(
  _user_id UUID,
  _action_type TEXT,
  _xp_amount INT,
  _reference_id TEXT DEFAULT NULL,
  _reference_type TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_new_total_xp INT;
  v_new_level INT;
  v_last_activity DATE;
  v_current_streak INT;
BEGIN
  -- 1. Insert transaction record
  INSERT INTO public.gamification_xp_transactions (user_id, action_type, xp_amount, reference_id, reference_type)
  VALUES (_user_id, _action_type, _xp_amount, _reference_id, _reference_type);

  -- 2. Get current profile stats
  SELECT last_activity_date, current_streak INTO v_last_activity, v_current_streak
  FROM public.gamification_profiles
  WHERE user_id = _user_id;

  -- 3. Update streak logic
  IF v_last_activity IS NULL OR v_last_activity < CURRENT_DATE THEN
    IF v_last_activity = CURRENT_DATE - INTERVAL '1 day' THEN
      -- Continuous streak
      UPDATE public.gamification_profiles
      SET 
        current_streak = current_streak + 1,
        longest_streak = GREATEST(longest_streak, current_streak + 1),
        last_activity_date = CURRENT_DATE
      WHERE user_id = _user_id;
    ELSE
      -- Streak broken (unless it's today already, handled by the first IF)
      UPDATE public.gamification_profiles
      SET 
        current_streak = 1,
        last_activity_date = CURRENT_DATE
      WHERE user_id = _user_id;
    END IF;
  END IF;

  -- 4. Update profile total XP
  UPDATE public.gamification_profiles
  SET 
    total_xp = total_xp + _xp_amount,
    updated_at = NOW()
  WHERE user_id = _user_id
  RETURNING total_xp INTO v_new_total_xp;

  -- 5. Check for level up
  SELECT level INTO v_new_level
  FROM public.gamification_levels
  WHERE min_xp <= v_new_total_xp
  ORDER BY level DESC
  LIMIT 1;

  -- 6. Update level if changed
  UPDATE public.gamification_profiles
  SET level = v_new_level
  WHERE user_id = _user_id AND level < v_new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh Leaderboard Cache Function
CREATE OR REPLACE FUNCTION public.refresh_leaderboard_cache()
RETURNS VOID AS $$
BEGIN
  -- Truncate and rebuild cache
  TRUNCATE public.gamification_leaderboard_cache;
  
  INSERT INTO public.gamification_leaderboard_cache (user_id, full_name, avatar_url, total_xp, level, rank)
  SELECT 
    p.user_id,
    pr.full_name,
    pr.avatar_url,
    p.total_xp,
    p.level,
    ROW_NUMBER() OVER (ORDER BY p.total_xp DESC) as rank
  FROM public.gamification_profiles p
  JOIN public.profiles pr ON p.user_id = pr.id
  ORDER BY p.total_xp DESC
  LIMIT 1000;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper for Achievement Check: Likes Received
CREATE OR REPLACE FUNCTION public.get_likes_received_count(_user_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(r.id) INTO v_count
  FROM public.comment_reactions r
  JOIN public.lesson_comments c ON r.comment_id = c.id
  WHERE c.user_id = _user_id AND r.reaction_type = 'like';
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper for Achievement Check: Completed Courses
CREATE OR REPLACE FUNCTION public.get_completed_courses_count(_user_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- A course is completed if all its published lessons are completed by the user
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT c.id
    FROM public.courses c
    JOIN public.lessons l ON l.course_id = c.id
    WHERE l.status = 'published'
    GROUP BY c.id
    HAVING COUNT(l.id) = (
      SELECT COUNT(lc.id)
      FROM public.lesson_completions lc
      WHERE lc.user_id = _user_id AND lc.lesson_id IN (SELECT id FROM public.lessons WHERE course_id = c.id)
    )
  ) AS completed_courses;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create gamification profile on new profile
CREATE OR REPLACE FUNCTION public.handle_new_gamification_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.gamification_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_gamification
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_gamification_profile();

--- AUTOMATIC XP TRIGGERS ---

-- 1. Lesson Completion (100 XP)
CREATE OR REPLACE FUNCTION public.handle_lesson_completion_xp()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id,
    'lesson_completion',
    100,
    NEW.lesson_id::TEXT,
    'lesson'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_lesson_completed_xp
  AFTER INSERT ON public.lesson_completions
  FOR EACH ROW EXECUTE FUNCTION public.handle_lesson_completion_xp();

-- 2. Exam Submission (200 XP + Bonus based on score)
CREATE OR REPLACE FUNCTION public.handle_exam_submission_xp()
RETURNS TRIGGER AS $$
DECLARE
  v_xp_amount INT;
BEGIN
  v_xp_amount := 200; -- Base XP
  
  -- Add bonus for high scores
  IF NEW.score >= 100 THEN
    v_xp_amount := v_xp_amount + 100;
  ELSIF NEW.score >= 80 THEN
    v_xp_amount := v_xp_amount + 50;
  END IF;

  PERFORM public.award_xp(
    NEW.student_id,
    'exam_submission',
    v_xp_amount,
    NEW.exam_id::TEXT,
    'exam'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_exam_submitted_xp
  AFTER INSERT ON public.exam_submissions
  FOR EACH ROW WHEN (NEW.score IS NOT NULL)
  EXECUTE FUNCTION public.handle_exam_submission_xp();

-- Also handle updates where score is set later (e.g. AI grading)
CREATE TRIGGER on_exam_score_updated_xp
  AFTER UPDATE ON public.exam_submissions
  FOR EACH ROW WHEN (OLD.score IS NULL AND NEW.score IS NOT NULL)
  EXECUTE FUNCTION public.handle_exam_submission_xp();

-- 3. Exercise Completion (50 XP)
CREATE OR REPLACE FUNCTION public.handle_exercise_completion_xp()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id,
    'exercise_completion',
    50,
    NEW.exercise_id::TEXT,
    'exercise'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_exercise_completed_xp
  AFTER INSERT ON public.exercise_completions
  FOR EACH ROW EXECUTE FUNCTION public.handle_exercise_completion_xp();

-- 4. Social Activity (10 XP for comment)
CREATE OR REPLACE FUNCTION public.handle_comment_posted_xp()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id,
    'comment_posted',
    10,
    NEW.id::TEXT,
    'comment'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_posted_xp
  AFTER INSERT ON public.lesson_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_posted_xp();

-- 5. Course Review (50 XP)
CREATE OR REPLACE FUNCTION public.handle_review_posted_xp()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id,
    'course_review',
    50,
    NEW.id::TEXT,
    'review'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_posted_xp
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_review_posted_xp();
