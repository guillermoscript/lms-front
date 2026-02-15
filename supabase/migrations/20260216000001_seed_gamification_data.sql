-- Seed initial gamification data

-- 1. Levels (1-20)
INSERT INTO public.gamification_levels (level, min_xp, title, icon) VALUES
(1, 0, 'Newcomer', '🥚'),
(2, 100, 'Seeker', '🐣'),
(3, 250, 'Learner', '🐥'),
(4, 500, 'Scholar', '📖'),
(5, 850, 'Apprentice', '🔨'),
(6, 1300, 'Novice', '🕯️'),
(7, 1900, 'Student', '📝'),
(8, 2600, 'Practitioner', '🧪'),
(9, 3400, 'Specialist', '🔍'),
(10, 4300, 'Adept', '✨'),
(11, 5400, 'Professional', '💼'),
(12, 6700, 'Expert', '🎓'),
(13, 8200, 'Scholar-Elite', '📜'),
(14, 10000, 'Master', '🏛️'),
(15, 12500, 'Grandmaster', '💎'),
(16, 15500, 'Sage', '🔮'),
(17, 19000, 'Oracle', '👁️'),
(18, 23000, 'Legend', '🏆'),
(19, 28000, 'Mythic', '🌌'),
(20, 35000, 'Transcendent', '♾️')
ON CONFLICT (level) DO UPDATE SET 
    min_xp = EXCLUDED.min_xp,
    title = EXCLUDED.title,
    icon = EXCLUDED.icon;

-- 2. Achievements
INSERT INTO public.gamification_achievements (slug, title, description, tier, category, icon, xp_reward, condition_type, condition_value) VALUES
-- Learning
('first_lesson', 'First Steps', 'Complete your first lesson', 'bronze', 'learning', '🎯', 50, 'lessons_completed', 1),
('lesson_enthusiast', 'Knowledge Seeker', 'Complete 10 lessons', 'silver', 'learning', '📚', 200, 'lessons_completed', 10),
('lesson_master', 'Scholar of the Year', 'Complete 50 lessons', 'gold', 'learning', '🏛️', 1000, 'lessons_completed', 50),

-- Exams & Exercises
('first_perfect_exam', 'Perfectionist', 'Score 100 on any exam', 'silver', 'assessment', '💯', 300, 'perfect_exams', 1),
('exam_veteran', 'Battle Tested', 'Complete 10 exams', 'silver', 'assessment', '🛡️', 500, 'exams_submitted', 10),
('exercise_wizard', 'Practice Makes Perfect', 'Complete 25 exercises', 'gold', 'assessment', '🧙‍♂️', 750, 'exercises_completed', 25),

-- Social
('vocal_student', 'Voice of Reason', 'Post your first comment', 'bronze', 'social', '💬', 50, 'comments_posted', 1),
('helpful_peer', 'Top Contributor', 'Receive 10 likes on your comments', 'silver', 'social', '🤝', 400, 'likes_received', 10),
('reviewer', 'Critical Thinker', 'Write 5 course reviews', 'bronze', 'social', '⭐', 150, 'reviews_written', 5),

-- Streaks & Progression
('week_streak', 'Consistency is Key', 'Maintain a 7-day streak', 'silver', 'streak', '🔥', 500, 'streak_days', 7),
('month_streak', 'Unstoppable', 'Maintain a 30-day streak', 'gold', 'streak', '⚡', 2000, 'streak_days', 30),
('level_10', 'Double Digits', 'Reach level 10', 'silver', 'progression', '🔟', 500, 'level_reached', 10)
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    tier = EXCLUDED.tier,
    category = EXCLUDED.category,
    icon = EXCLUDED.icon,
    xp_reward = EXCLUDED.xp_reward,
    condition_type = EXCLUDED.condition_type,
    condition_value = EXCLUDED.condition_value;

-- 3. Store Items
INSERT INTO public.gamification_store_items (slug, name, description, price_coins, icon, category, max_per_user) VALUES
('streak_freeze', 'Streak Freeze', 'Protects your streak if you miss a day. (Max 5)', 500, '🧊', 'power_up', 5),
('double_xp_1h', 'Double XP (1h)', 'Earn double XP for all activities for the next hour', 1000, '⚡', 'power_up', NULL),
('hint_token', 'Hint Token', 'Unlock a hint during exercises or exams', 200, '💡', 'power_up', NULL),
('early_access', 'Course Early Access', 'Get access to new courses 7 days before everyone else', 5000, '🔑', 'power_up', 1),
('custom_avatar_frame', 'Golden Frame', 'A special golden frame for your profile picture', 2500, '🖼️', 'cosmetic', 1),
('vip_badge', 'VIP Supporter', 'A unique badge on your profile showing your support', 10000, '💎', 'cosmetic', 1)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_coins = EXCLUDED.price_coins,
    icon = EXCLUDED.icon,
    category = EXCLUDED.category,
    max_per_user = EXCLUDED.max_per_user;
