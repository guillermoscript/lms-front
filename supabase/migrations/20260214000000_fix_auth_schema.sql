-- Fix for AuthApiError: error finding refresh token: ERROR: column refresh_tokens.parent does not exist
-- This column is required by newer versions of Supabase Auth (GoTrue)

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'auth' 
    AND table_name = 'refresh_tokens' 
    AND column_name = 'parent'
  ) THEN
    ALTER TABLE auth.refresh_tokens ADD COLUMN parent varchar(255);
    COMMENT ON COLUMN auth.refresh_tokens.parent IS 'The parent refresh token from which this token was issued.';
  END IF;
END $$;
