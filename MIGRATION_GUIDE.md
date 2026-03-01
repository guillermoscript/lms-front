# Database Migration Guide

## Migration: Admin Dashboard Setup

This guide helps you apply the admin dashboard database migration manually if `supabase db push` times out.

## Migration File Location

```
supabase/migrations/20260201145244_admin_dashboard_setup.sql
```

## Option 1: Via Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy Migration SQL**
   - Open `supabase/migrations/20260201145244_admin_dashboard_setup.sql`
   - Copy the entire contents

4. **Execute Migration**
   - Paste the SQL into the editor
   - Click "Run" button
   - Wait for success message

5. **Verify Changes**
   - Go to "Table Editor"
   - Check that new columns exist:
     - `profiles.deactivated_at`
     - `products.status, stripe_product_id, stripe_price_id`
     - `plans.stripe_product_id, stripe_price_id`
     - `courses.archived_at`
   - Check RLS is enabled on `user_roles` table

## Option 2: Via Supabase CLI (Retry)

If the connection was temporary, try again:

```bash
# Retry push
supabase db push

# Or push with debug output
supabase db push --debug
```

## Option 3: Via Local Postgres Client

If you have `psql` installed:

```bash
# Get connection string from Supabase dashboard
# Settings > Database > Connection string (URI)

# Connect to database
psql "postgresql://postgres:[YOUR-PASSWORD]@db.tcqqnjfwmbfwcyhafbbt.supabase.co:5432/postgres"

# Copy/paste migration SQL and execute
```

## What This Migration Does

### 1. Schema Changes

**Profiles Table:**
- Adds `deactivated_at TIMESTAMPTZ` for user deactivation tracking

**Products Table:**
- Adds `status VARCHAR(20) DEFAULT 'active'` for soft delete
- Adds `stripe_product_id TEXT` for Stripe integration
- Adds `stripe_price_id TEXT` for Stripe integration

**Plans Table:**
- Adds `stripe_product_id TEXT` for Stripe integration
- Adds `stripe_price_id TEXT` for Stripe integration

**Courses Table:**
- Adds `archived_at TIMESTAMPTZ` for archival tracking

### 2. Security Fixes

**Enables RLS on `user_roles` table:**
- Previously RLS was disabled (security issue)
- Now enabled with proper policies

**Creates Policies:**
1. "Admins can manage all roles" - Allows admins to manage all user roles
2. "Users can view their own roles" - Allows users to see their own roles

### 3. Performance Indexes

- `idx_profiles_deactivated_at` - Speeds up active/deactivated user queries
- `idx_products_status` - Speeds up active/inactive product queries

## Verification Steps

After applying the migration, verify it worked:

### 1. Check Columns Exist

```sql
-- Check profiles table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name = 'deactivated_at';

-- Check products table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN ('status', 'stripe_product_id', 'stripe_price_id');

-- Check plans table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'plans'
  AND column_name IN ('stripe_product_id', 'stripe_price_id');

-- Check courses table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'courses'
  AND column_name = 'archived_at';
```

### 2. Check RLS is Enabled

```sql
-- Verify RLS is enabled on user_roles
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'user_roles';

-- Should show rowsecurity = true
```

### 3. Check Policies Exist

```sql
-- List policies on user_roles table
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'user_roles';

-- Should show:
-- 1. "Admins can manage all roles"
-- 2. "Users can view their own roles"
```

### 4. Check Indexes

```sql
-- Verify indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('profiles', 'products');

-- Should show:
-- idx_profiles_deactivated_at
-- idx_products_status
```

## Rollback (If Needed)

If something goes wrong, you can rollback the changes:

```sql
-- Rollback script (only use if necessary)

-- Remove columns
ALTER TABLE profiles DROP COLUMN IF EXISTS deactivated_at;
ALTER TABLE products DROP COLUMN IF EXISTS status;
ALTER TABLE products DROP COLUMN IF EXISTS stripe_product_id;
ALTER TABLE products DROP COLUMN IF EXISTS stripe_price_id;
ALTER TABLE plans DROP COLUMN IF EXISTS stripe_product_id;
ALTER TABLE plans DROP COLUMN IF EXISTS stripe_price_id;
ALTER TABLE courses DROP COLUMN IF EXISTS archived_at;

-- Remove indexes
DROP INDEX IF EXISTS idx_profiles_deactivated_at;
DROP INDEX IF EXISTS idx_products_status;

-- Remove policies (optional - keeps security tight)
-- DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
-- DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;

-- Disable RLS (NOT RECOMMENDED - was a security issue)
-- ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
```

## Common Issues

### Issue: "Column already exists"
**Cause:** Migration was partially applied before
**Solution:** The migration uses `IF NOT EXISTS` - safe to run again

### Issue: "Policy already exists"
**Cause:** Policies from previous migration attempts
**Solution:** Drop policies first, then recreate:
```sql
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
-- Then run migration again
```

### Issue: "Permission denied"
**Cause:** Not using correct database credentials
**Solution:** Use the service role key or connection string from Supabase dashboard

## After Migration Success

1. **Test Admin Dashboard**
   - Navigate to `/dashboard/admin/users`
   - Try assigning roles (should work if migration successful)
   - Try deactivating a user (uses new column)

2. **Check Application Logs**
   - Monitor for any database errors
   - Verify admin actions complete successfully

3. **Mark Migration as Applied**
   ```bash
   # If using Supabase CLI, sync the migration record
   supabase db pull
   ```

## Need Help?

If you encounter issues:

1. Check Supabase dashboard logs (Logs > Postgres Logs)
2. Review error messages carefully
3. Verify your database permissions
4. Try rollback and re-apply if needed

---

**Migration File:** `20260201145244_admin_dashboard_setup.sql`
**Created:** 2026-02-01
**Status:** Ready to apply
