-- Ensure Admin User Has Admin Role
-- This migration ensures test users have the proper roles
-- NOTE: This assumes users exist in auth.users (created by seed script)

-- Insert admin role for admin user if it doesn't exist
INSERT INTO user_roles (user_id, role)
SELECT au.id, 'admin'
FROM auth.users au
WHERE au.email = 'admin@test.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Also ensure teacher has teacher role
INSERT INTO user_roles (user_id, role)
SELECT au.id, 'teacher'
FROM auth.users au
WHERE au.email = 'teacher@test.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Ensure student has student role
INSERT INTO user_roles (user_id, role)
SELECT au.id, 'student'
FROM auth.users au
WHERE au.email = 'student@test.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE user_roles IS 'Stores user role assignments. Users can have multiple roles (student, teacher, admin).';
