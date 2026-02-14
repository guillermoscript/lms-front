-- Complete JWT Hook Fix with missing type
-- This ensures the app_role enum type exists before creating the function

-- Create the app_role enum type if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'teacher', 'student');
    COMMENT ON TYPE public.app_role IS 'User roles in the application';
  END IF;
END $$;

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);

-- Recreate the function with proper security context
-- SECURITY DEFINER allows it to bypass RLS and query user_roles
-- STABLE indicates it doesn't modify data
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  user_role public.app_role;
BEGIN
  -- Extract claims from the event
  claims := event->'claims';
  
  -- Fetch the user role directly (SECURITY DEFINER bypasses RLS)
  SELECT role INTO user_role 
  FROM public.user_roles 
  WHERE user_id = (event->>'user_id')::uuid
  LIMIT 1;

  -- Add role to claims
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role::text));
  ELSE
    -- Default to 'student' if no role is assigned
    claims := jsonb_set(claims, '{user_role}', to_jsonb('student'::text));
  END IF;

  -- Return the modified event with updated claims
  RETURN jsonb_set(event, '{claims}', claims);
EXCEPTION
  WHEN OTHERS THEN
    -- If anything goes wrong, log error but don't break auth
    -- Return original event to allow authentication to proceed
    RAISE WARNING 'Error in custom_access_token_hook: %', SQLERRM;
    RETURN event;
END;
$$;

-- Grant necessary permissions to Supabase Auth
-- These are required for the auth service to execute the hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Ensure the function owner has proper permissions
ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;

-- Add comment for documentation
COMMENT ON FUNCTION public.custom_access_token_hook IS 
'JWT hook that adds user_role claim to access tokens. Called by Supabase Auth during token generation.';
