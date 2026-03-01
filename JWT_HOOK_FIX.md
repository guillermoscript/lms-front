# JWT Hook Error Fix

## Problem
You're encountering this error when creating new users:
```
Error running hook URI: pg-functions://postgres/public/custom_access_token_hook
```

## Root Cause
The `custom_access_token_hook` function that injects user roles into JWT tokens is either:
1. Missing proper permissions for Supabase Auth to execute it
2. Has an error in its implementation
3. Needs proper error handling

## Solution

I've created a comprehensive fix with backup/restore capabilities to protect your English course data.

### Step 1: Backup Your English Course (IMPORTANT!)

Before any database reset, backup your course data:

```bash
npm run backup-course
```

This will create `supabase/backup-courses.json` with all your courses, lessons, exercises, exams, and questions.

### Step 2: Apply the Fix

You have two options:

#### Option A: Apply Migration Only (Recommended - No Data Loss)

```bash
# Push the new migration to fix the JWT hook
supabase db push

# Restart Supabase services to reload the hook
supabase stop
supabase start
```

#### Option B: Full Database Reset (If Option A doesn't work)

```bash
# Reset the database (this applies all migrations including the fix)
supabase db reset

# Restore your English course
npm run restore-course
```

### Step 3: Test User Creation

Try creating a new user through your signup form. The error should be gone.

## What the Fix Does

The new migration (`20260214010000_fix_jwt_hook_permissions.sql`) does the following:

1. **Drops and recreates** the `custom_access_token_hook` function with proper settings
2. **Adds error handling** so auth doesn't break if the hook fails
3. **Grants explicit permissions** to `supabase_auth_admin` and `service_role`
4. **Sets proper ownership** to the `postgres` user
5. **Defaults to 'student' role** if no role is found (instead of returning null)

## Key Changes

```sql
-- Before: No error handling
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
...

-- After: With error handling and default role
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
...
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in custom_access_token_hook: %', SQLERRM;
    RETURN event;  -- Don't break auth if hook fails
END;
```

## Verification

After applying the fix, verify it's working:

1. **Check the function exists:**
   ```bash
   supabase db diff
   ```

2. **Create a test user** through your signup form

3. **Check the user's JWT** includes the `user_role` claim:
   - Open browser DevTools
   - Go to Application > Local Storage
   - Find the Supabase session
   - Decode the JWT at jwt.io to see claims

## Backup/Restore Scripts

I've created two helper scripts:

### `scripts/backup-english-course.ts`
- Exports all courses with full nested data
- Saves to `supabase/backup-courses.json`
- Run with: `npm run backup-course`

### `scripts/restore-english-course.ts`
- Imports from `supabase/backup-courses.json`
- Recreates courses with new IDs
- Maintains relationships between courses, lessons, exams, etc.
- Run with: `npm run restore-course`

## If You Still Have Issues

If the error persists after applying the fix:

1. Check Supabase logs:
   ```bash
   supabase logs --local
   ```

2. Check the auth service logs specifically:
   ```bash
   docker logs supabase_auth_lms-front
   ```

3. Verify the config.toml has the hook enabled (lines 263-265):
   ```toml
   [auth.hook.custom_access_token]
   enabled = true
   uri = "pg-functions://postgres/public/custom_access_token_hook"
   ```

4. Make sure the `user_roles` table has proper data:
   - New users should get 'student' role automatically via `handle_new_user()` trigger

## Notes

- Your English course data is **NOT in the seed files**, so backup is essential before any reset
- The JWT hook runs **during every authentication** to add the `user_role` claim
- The hook must be **fast and reliable** or it will block authentication
- The new version includes error handling to prevent auth from breaking
