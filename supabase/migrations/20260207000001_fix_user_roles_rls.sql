-- Fix user_roles RLS policies to prevent infinite recursion
-- The issue: policies that query user_roles while checking user_roles create infinite loops
-- Solution: Use JWT claims (user_role) instead of querying the table

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;

-- Users can view their own roles (no recursion - just checks user_id)
CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT 
  USING (user_id = auth.uid());

-- Admins can manage all roles (uses JWT claim instead of querying user_roles)
-- The user_role claim is set by custom_access_token_hook
CREATE POLICY "Admins can manage all roles" ON user_roles
  FOR ALL 
  USING (
    (auth.jwt() ->> 'user_role') = 'admin'
  );

-- Teachers can view all roles (for their course management)
CREATE POLICY "Teachers can view all roles" ON user_roles
  FOR SELECT
  USING (
    (auth.jwt() ->> 'user_role') IN ('teacher', 'admin')
  );
