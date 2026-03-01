-- Create API tokens table for CLI/programmatic MCP access
-- Allows teachers and admins to create personal access tokens for tools like OpenCode

CREATE TABLE mcp_api_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the token
  name TEXT NOT NULL, -- User-friendly name (e.g., "OpenCode on MacBook")
  
  -- Token metadata
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL means never expires
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Security metadata
  created_ip INET,
  last_used_ip INET
);

-- Indexes
CREATE INDEX idx_mcp_tokens_user_id ON mcp_api_tokens(user_id);
CREATE INDEX idx_mcp_tokens_token_hash ON mcp_api_tokens(token_hash);
CREATE INDEX idx_mcp_tokens_active ON mcp_api_tokens(is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE mcp_api_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view their own tokens
CREATE POLICY "Users view own API tokens"
  ON mcp_api_tokens FOR SELECT
  USING (user_id = auth.uid());

-- Users can create tokens for themselves
CREATE POLICY "Users create own API tokens"
  ON mcp_api_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own tokens (revoke, rename)
CREATE POLICY "Users update own API tokens"
  ON mcp_api_tokens FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own tokens
CREATE POLICY "Users delete own API tokens"
  ON mcp_api_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE mcp_api_tokens IS 'Personal access tokens for CLI/programmatic MCP access';
COMMENT ON COLUMN mcp_api_tokens.token_hash IS 'SHA-256 hash of the bearer token. Token is never stored in plaintext.';
COMMENT ON COLUMN mcp_api_tokens.name IS 'User-friendly identifier for the token (e.g., device name)';
COMMENT ON COLUMN mcp_api_tokens.expires_at IS 'Optional expiration date. NULL means token never expires.';

-- Function to validate a token and return user info
CREATE OR REPLACE FUNCTION validate_mcp_api_token(token_input TEXT)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  user_role TEXT,
  token_id BIGINT
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  token_hash_input TEXT;
BEGIN
  -- Hash the input token
  token_hash_input := encode(digest(token_input, 'sha256'), 'hex');
  
  -- Find matching token and get user info
  RETURN QUERY
  SELECT 
    t.user_id,
    u.email,
    r.role_name,
    t.id
  FROM mcp_api_tokens t
  JOIN auth.users u ON u.id = t.user_id
  JOIN user_roles ur ON ur.user_id = t.user_id
  JOIN roles r ON r.id = ur.role_id
  WHERE t.token_hash = token_hash_input
    AND t.is_active = true
    AND (t.expires_at IS NULL OR t.expires_at > NOW())
    AND r.role_name IN ('teacher', 'admin')
  LIMIT 1;
END;
$$;

-- Function to update last_used timestamp
CREATE OR REPLACE FUNCTION update_token_last_used(token_id_input BIGINT, ip_input INET)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mcp_api_tokens
  SET 
    last_used_at = NOW(),
    last_used_ip = ip_input
  WHERE id = token_id_input;
END;
$$;

COMMENT ON FUNCTION validate_mcp_api_token IS 'Validates an API token and returns user info. Returns empty if invalid/expired/revoked.';
COMMENT ON FUNCTION update_token_last_used IS 'Updates the last_used_at timestamp and IP for a token.';
