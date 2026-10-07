-- BYOK AI: each school brings its own provider keys.
--
-- Key material is AES-256-GCM encrypted in the app (lib/ai/byok/crypto.ts,
-- AAD = tenantId:provider). The database only ever stores the envelope, so
-- `tenant_ai_credentials` is locked to service_role: no anon/authenticated
-- grant and no policy. Admins read a masked DTO through a server action, UI
-- "is AI on?" flags go through the boolean-only tenant_ai_configured() RPC.
--
-- Writes to the settings/audit tables are server-only too (service role), so a
-- user-scoped client can never repoint a tenant's default model by PostgREST.

-- ---------------------------------------------------------------------------
-- 1. Credentials (ciphertext) — service_role only
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_ai_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'openai', 'anthropic', 'google', 'openrouter', 'groq', 'mistral', 'xai', 'deepseek', 'assemblyai'
  )),
  key_ciphertext TEXT NOT NULL,
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  key_last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'disabled')),
  validated_at TIMESTAMPTZ,
  last_error_code TEXT,
  -- Non-secret provider model list: [{id, label, caps}]
  models_cache JSONB,
  models_cached_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  CONSTRAINT tenant_ai_credentials_tenant_provider_key UNIQUE (tenant_id, provider)
);

COMMENT ON TABLE public.tenant_ai_credentials IS
  'Per-tenant AI provider API keys, app-level AES-256-GCM encrypted (AAD tenantId:provider). service_role only: never selectable by anon/authenticated, not even super admins.';

CREATE TRIGGER update_tenant_ai_credentials_updated_at
  BEFORE UPDATE ON public.tenant_ai_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_ai_credentials ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: RLS on + zero policies = deny for every non-bypass role.
REVOKE ALL ON public.tenant_ai_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenant_ai_credentials TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Tenant default model + managed-billing seam
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_ai_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- 'managed' is a seam for platform-billed AI; only 'byok' is implemented.
  mode TEXT NOT NULL DEFAULT 'byok' CHECK (mode IN ('byok', 'managed')),
  default_provider TEXT CHECK (default_provider IS NULL OR default_provider IN (
    'openai', 'anthropic', 'google', 'openrouter', 'groq', 'mistral', 'xai', 'deepseek'
  )),
  default_model TEXT,
  -- Whether Langfuse traces may carry prompt/completion text for this tenant.
  -- Lives here (not in the key-value tenant_settings table). Missing row = true.
  ai_trace_content BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_ai_settings_default_pair CHECK (
    (default_provider IS NULL) = (default_model IS NULL)
  )
);

COMMENT ON TABLE public.tenant_ai_settings IS
  'Per-tenant AI mode and default model. Read by tenant members/super admins; written only by server actions via the service role.';

CREATE TRIGGER update_tenant_ai_settings_updated_at
  BEFORE UPDATE ON public.tenant_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Per-feature model overrides
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_ai_feature_models (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- AiFeature id (lib/ai/features.ts). Not CHECKed here: adding a feature must not need a migration.
  feature TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN (
    'openai', 'anthropic', 'google', 'openrouter', 'groq', 'mistral', 'xai', 'deepseek', 'assemblyai'
  )),
  model TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature)
);

COMMENT ON TABLE public.tenant_ai_feature_models IS
  'Per-tenant, per-feature model override (resolution step 2). Read by tenant members/super admins; written only via the service role.';

CREATE TRIGGER update_tenant_ai_feature_models_updated_at
  BEFORE UPDATE ON public.tenant_ai_feature_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_ai_feature_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read AI settings"
  ON public.tenant_ai_settings FOR SELECT TO authenticated
  USING (tenant_id = public.get_tenant_id() OR public.is_super_admin());

CREATE POLICY "Tenant members read AI feature models"
  ON public.tenant_ai_feature_models FOR SELECT TO authenticated
  USING (tenant_id = public.get_tenant_id() OR public.is_super_admin());

REVOKE ALL ON public.tenant_ai_settings, public.tenant_ai_feature_models FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_ai_settings, public.tenant_ai_feature_models TO authenticated;
GRANT ALL ON public.tenant_ai_settings, public.tenant_ai_feature_models TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Audit trail (never key material)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_ai_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'set', 'rotate', 'delete', 'validate_fail', 'model_change', 'auto_invalidated'
  )),
  provider TEXT,
  feature TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_ai_audit IS
  'Who changed which AI credential/model and when. Contains no key material. Written by the service role only.';

CREATE INDEX idx_tenant_ai_audit_tenant_at ON public.tenant_ai_audit (tenant_id, at DESC);

ALTER TABLE public.tenant_ai_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins read their AI audit"
  ON public.tenant_ai_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_ai_audit.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role = 'admin'
        AND tu.status = 'active'
    )
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  );

REVOKE ALL ON public.tenant_ai_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_ai_audit TO authenticated;
GRANT ALL ON public.tenant_ai_audit TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Per-course Aristotle model (resolution step 1)
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_ai_tutors
  ADD COLUMN provider TEXT CHECK (provider IS NULL OR provider IN (
    'openai', 'anthropic', 'google', 'openrouter', 'groq', 'mistral', 'xai', 'deepseek'
  )),
  ADD COLUMN model TEXT,
  ADD CONSTRAINT course_ai_tutors_provider_model_pair CHECK ((provider IS NULL) = (model IS NULL));

-- ---------------------------------------------------------------------------
-- 6. tenant_ai_configured(): boolean-only flags for UI gating
--    {"openai": true, "anthropic": true, ...} — ACTIVE credentials only.
--    Callable by any member of the tenant (students hide the Aristotle
--    trigger with it); reveals nothing but presence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_ai_configured(_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _tenant_id IS NULL
     OR NOT (_tenant_id = public.get_tenant_id() OR public.is_super_admin()) THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_object_agg(c.provider, true)
      FROM public.tenant_ai_credentials c
      WHERE c.tenant_id = _tenant_id
        AND c.status = 'active'
    ),
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.tenant_ai_configured(UUID) IS
  'Provider -> true map of the tenant''s ACTIVE AI credentials. Boolean only, never key material. Empty object for a tenant other than the caller''s (unless super admin).';

REVOKE ALL ON FUNCTION public.tenant_ai_configured(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_ai_configured(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. AI chat budgets no longer apply: the tenant pays its provider directly.
--    increment_ai_chat_usage reads these via tenant_plan_limit(); -1 = unlimited.
--    The per-minute aiChatLimiter and per-checkpoint/student caps stay as abuse brakes.
-- ---------------------------------------------------------------------------
UPDATE public.platform_plans
   SET limits = limits || jsonb_build_object(
         'max_ai_messages_per_day', -1,
         'max_ai_messages_per_month', -1
       );
