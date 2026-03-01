-- Fix validate_mcp_api_token RPC to use tenant_users (authoritative role source)
-- instead of the legacy user_roles/roles join which had wrong column references
DROP FUNCTION IF EXISTS validate_mcp_api_token(TEXT);

CREATE FUNCTION validate_mcp_api_token(token_input TEXT)
RETURNS TABLE(user_id UUID, email TEXT, user_role TEXT, token_id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token_hash_input TEXT;
BEGIN
  -- Hash the input token
  token_hash_input := encode(digest(token_input, 'sha256'), 'hex');

  -- Find matching token and get user info via tenant_users (authoritative role source)
  RETURN QUERY
  SELECT
    t.user_id,
    u.email::TEXT,
    tu.role::TEXT,
    t.id
  FROM mcp_api_tokens t
  JOIN auth.users u ON u.id = t.user_id
  JOIN tenant_users tu ON tu.user_id = t.user_id AND tu.status = 'active'
  WHERE t.token_hash = token_hash_input
    AND t.is_active = true
    AND (t.expires_at IS NULL OR t.expires_at > NOW())
    AND tu.role IN ('teacher', 'admin')
  LIMIT 1;
END;
$$;
