-- Create profiles for existing test users
-- The handle_new_user() trigger should do this automatically,
-- but for seed data created directly in auth.users, we need to backfill

INSERT INTO profiles (id, full_name, bio, avatar_url, created_at)
SELECT
  au.id,
  CASE
    WHEN au.email = 'student@test.com' THEN 'Test Student'
    WHEN au.email = 'teacher@test.com' THEN 'Test Teacher'
    WHEN au.email = 'admin@test.com' THEN 'Test Admin'
    ELSE 'Test User'
  END as full_name,
  NULL as bio,
  NULL as avatar_url,
  NOW() as created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = au.id
);
