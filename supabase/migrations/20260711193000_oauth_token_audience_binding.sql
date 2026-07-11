-- RFC 8707-style audience binding for OAuth-client access tokens.
--
-- Claude connectors (claude.ai / Claude Desktop) send the RFC 8707 `resource`
-- parameter and expect the issued token's `aud` to cover the MCP server URL
-- (https://claude.com/docs/connectors/building/troubleshooting, "Audience
-- mismatch"). Supabase Auth ignores `resource` and always issues
-- aud="authenticated", so connector clients that validate audience discard the
-- token. Fix: for tokens minted through the OAuth server (detected via the
-- `client_id` claim — never present on password/refresh logins), rewrite `aud`
-- to an array that keeps "authenticated" (required by PostgREST role mapping
-- and the MCP server's JWT verification) and appends the registered MCP
-- resource URLs.

CREATE TABLE IF NOT EXISTS app_private.oauth_token_audiences (
  url text PRIMARY KEY
);

COMMENT ON TABLE app_private.oauth_token_audiences IS
  'MCP resource URLs appended to the aud claim of OAuth-client access tokens (RFC 8707 audience binding). Read by custom_access_token_hook.';

INSERT INTO app_private.oauth_token_audiences (url)
VALUES ('https://preciopana.com/api/mcp')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION app_private.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  claims jsonb;
  user_role public.app_role;
  v_tenant_id uuid;
  v_tenant_role text;
  v_is_super_admin boolean;
  v_aud jsonb;
BEGIN
  claims := event->'claims';

  -- Fetch user role
  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  LIMIT 1;

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role::text));
  ELSE
    claims := jsonb_set(claims, '{user_role}', to_jsonb('student'::text));
  END IF;

  -- Check if super admin
  SELECT EXISTS(
    SELECT 1 FROM public.super_admins WHERE user_id = (event->>'user_id')::uuid
  ) INTO v_is_super_admin;
  claims := jsonb_set(claims, '{is_super_admin}', to_jsonb(v_is_super_admin));

  -- Get tenant context from raw_app_meta_data if available
  v_tenant_id := (event->'claims'->'app_metadata'->>'tenant_id')::uuid;

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));

    -- Get tenant role
    SELECT tu.role INTO v_tenant_role
    FROM public.tenant_users tu
    WHERE tu.user_id = (event->>'user_id')::uuid
      AND tu.tenant_id = v_tenant_id
      AND tu.status = 'active'
    LIMIT 1;

    IF v_tenant_role IS NOT NULL THEN
      claims := jsonb_set(claims, '{tenant_role}', to_jsonb(v_tenant_role));
    ELSE
      claims := jsonb_set(claims, '{tenant_role}', to_jsonb('student'::text));
    END IF;
  END IF;

  -- Audience binding for OAuth-client tokens (see header comment). Password
  -- and refresh-token logins carry no client_id claim and are untouched.
  IF claims ? 'client_id' THEN
    SELECT jsonb_agg(x.u) INTO v_aud
    FROM (
      SELECT 'authenticated' AS u
      UNION ALL
      SELECT url FROM app_private.oauth_token_audiences
    ) x;
    IF v_aud IS NOT NULL AND jsonb_array_length(v_aud) > 1 THEN
      claims := jsonb_set(claims, '{aud}', v_aud);
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in custom_access_token_hook: %', SQLERRM;
    RETURN event;
END;
$function$;
