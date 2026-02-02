-- Migration: Admin Dashboard Setup
-- Description: Adds necessary columns and RLS policies for admin dashboard functionality

-- 1. Add deactivated_at column to profiles for user deactivation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- 2. Add status column to products for soft delete
ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 3. Add Stripe fields to plans
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 4. Enable RLS on user_roles table (security fix)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Create admin-only policy for user_roles table
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
CREATE POLICY "Admins can manage all roles" ON user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 6. Create policy for users to view their own roles
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- 7. Add archived_at column to courses (for tracking)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 8. Create index on deactivated_at for performance
CREATE INDEX IF NOT EXISTS idx_profiles_deactivated_at ON profiles(deactivated_at);

-- 9. Create index on product status
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- 10. Add comment for documentation
COMMENT ON COLUMN profiles.deactivated_at IS 'Timestamp when the user account was deactivated by an admin';
COMMENT ON COLUMN products.status IS 'Product status: active or inactive (archived)';
