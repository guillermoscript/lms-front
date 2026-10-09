-- Issue #929: where schools wire platform-fee bank transfers.
--
-- Replaces the rejected PLATFORM_FEE_BANK_INSTRUCTIONS env var with structured
-- bank accounts the platform super admins manage in /platform/bank-accounts.
--
--   1. platform_bank_accounts: one row per receiving account. At most ONE active
--      account per currency (partial unique index). Server-read only: super
--      admins can SELECT through RLS; schools never read the table, the
--      earnings page reads the matching account with the service role after
--      verifying the viewer is an admin of the school that owes the fee.
--   2. Writes go through two SECURITY DEFINER functions (service_role only)
--      that re-check super_admins for the actor and append
--      platform_fee_audit_log in the same transaction. The audit row never
--      carries the account number, only which fields changed.
--   3. platform_fee_audit_log gains the bank_account_* actions; tenant_id
--      becomes nullable for them only (a platform account belongs to no school).

-- ─── 1. Table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL DEFAULT 'USD'
    CONSTRAINT platform_bank_accounts_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  label text NOT NULL
    CONSTRAINT platform_bank_accounts_label_len CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  bank_name text NOT NULL
    CONSTRAINT platform_bank_accounts_bank_name_len CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 120),
  account_holder text NOT NULL
    CONSTRAINT platform_bank_accounts_holder_len CHECK (char_length(btrim(account_holder)) BETWEEN 1 AND 120),
  account_number text NOT NULL
    CONSTRAINT platform_bank_accounts_number_len CHECK (char_length(btrim(account_number)) BETWEEN 1 AND 64),
  account_type text
    CONSTRAINT platform_bank_accounts_type_len CHECK (account_type IS NULL OR char_length(btrim(account_type)) BETWEEN 1 AND 40),
  routing_number text
    CONSTRAINT platform_bank_accounts_routing_len CHECK (routing_number IS NULL OR char_length(btrim(routing_number)) BETWEEN 1 AND 40),
  swift_code text
    CONSTRAINT platform_bank_accounts_swift_format CHECK (swift_code IS NULL OR swift_code ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  extra_instructions text
    CONSTRAINT platform_bank_accounts_extra_len CHECK (extra_instructions IS NULL OR char_length(extra_instructions) BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_bank_accounts IS
  'Issue #929: platform bank accounts schools wire platform-fee transfers to. Managed by super admins (/platform/bank-accounts) through save_/set_platform_bank_account*; one active account per currency. Never readable by schools directly.';

CREATE UNIQUE INDEX IF NOT EXISTS platform_bank_accounts_one_active_per_currency
  ON public.platform_bank_accounts (currency) WHERE is_active;

ALTER TABLE public.platform_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view platform bank accounts" ON public.platform_bank_accounts;
CREATE POLICY "Super admins can view platform bank accounts"
  ON public.platform_bank_accounts FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()));

REVOKE ALL ON TABLE public.platform_bank_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_bank_accounts TO authenticated;
GRANT ALL ON TABLE public.platform_bank_accounts TO service_role;

-- ─── 2. Audit log: bank account actions, platform-scoped ───────────────────

ALTER TABLE public.platform_fee_audit_log DROP CONSTRAINT IF EXISTS platform_fee_audit_log_action_check;
ALTER TABLE public.platform_fee_audit_log ADD CONSTRAINT platform_fee_audit_log_action_check CHECK (action IN (
  'request_confirmed', 'offline_recorded', 'waived', 'payment_reversed',
  'exemption_set', 'exemption_cleared',
  'bank_account_created', 'bank_account_updated', 'bank_account_activated', 'bank_account_deactivated'
));

ALTER TABLE public.platform_fee_audit_log ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.platform_fee_audit_log DROP CONSTRAINT IF EXISTS platform_fee_audit_log_tenant_scope;
ALTER TABLE public.platform_fee_audit_log ADD CONSTRAINT platform_fee_audit_log_tenant_scope
  CHECK (tenant_id IS NOT NULL OR action LIKE 'bank\_account\_%');

-- ─── 3. Write functions ────────────────────────────────────────────────────

-- Create (_id NULL) or update one account. Returns its id. Normalises input
-- (trim, upper-case currency/SWIFT, blank optional -> NULL); the CHECKs decide
-- validity (23514). A second active account for a currency raises 23505.
CREATE OR REPLACE FUNCTION public.save_platform_bank_account(
  _actor uuid,
  _id uuid,
  _currency text,
  _label text,
  _bank_name text,
  _account_holder text,
  _account_number text,
  _account_type text DEFAULT NULL,
  _routing_number text DEFAULT NULL,
  _swift_code text DEFAULT NULL,
  _extra_instructions text DEFAULT NULL,
  _sort_order integer DEFAULT 0,
  _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _old platform_bank_accounts%ROWTYPE;
  _new platform_bank_accounts%ROWTYPE;
  _changed text[] := ARRAY[]::text[];
BEGIN
  PERFORM assert_platform_fee_super_admin(_actor);

  IF _id IS NULL THEN
    INSERT INTO platform_bank_accounts (
      currency, label, bank_name, account_holder, account_number, account_type,
      routing_number, swift_code, extra_instructions, sort_order, is_active,
      created_by, updated_by
    ) VALUES (
      upper(btrim(coalesce(_currency, ''))), btrim(coalesce(_label, '')), btrim(coalesce(_bank_name, '')),
      btrim(coalesce(_account_holder, '')), btrim(coalesce(_account_number, '')),
      NULLIF(btrim(_account_type), ''), NULLIF(btrim(_routing_number), ''),
      NULLIF(upper(regexp_replace(coalesce(_swift_code, ''), '\s', '', 'g')), ''),
      NULLIF(btrim(_extra_instructions), ''), coalesce(_sort_order, 0), coalesce(_is_active, true),
      _actor, _actor
    )
    RETURNING * INTO _new;

    INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, currency, details)
    VALUES (NULL, _actor, 'bank_account_created', _new.currency,
            jsonb_build_object('bank_account_id', _new.id, 'label', _new.label, 'is_active', _new.is_active));
    RETURN _new.id;
  END IF;

  SELECT * INTO _old FROM platform_bank_accounts WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE platform_bank_accounts SET
    currency = upper(btrim(coalesce(_currency, ''))),
    label = btrim(coalesce(_label, '')),
    bank_name = btrim(coalesce(_bank_name, '')),
    account_holder = btrim(coalesce(_account_holder, '')),
    account_number = btrim(coalesce(_account_number, '')),
    account_type = NULLIF(btrim(_account_type), ''),
    routing_number = NULLIF(btrim(_routing_number), ''),
    swift_code = NULLIF(upper(regexp_replace(coalesce(_swift_code, ''), '\s', '', 'g')), ''),
    extra_instructions = NULLIF(btrim(_extra_instructions), ''),
    sort_order = coalesce(_sort_order, 0),
    is_active = coalesce(_is_active, is_active),
    updated_by = _actor,
    updated_at = now()
  WHERE id = _id
  RETURNING * INTO _new;

  -- Field NAMES only: the audit trail never stores account details.
  IF _new.currency IS DISTINCT FROM _old.currency THEN _changed := array_append(_changed, 'currency'); END IF;
  IF _new.label IS DISTINCT FROM _old.label THEN _changed := array_append(_changed, 'label'); END IF;
  IF _new.bank_name IS DISTINCT FROM _old.bank_name THEN _changed := array_append(_changed, 'bank_name'); END IF;
  IF _new.account_holder IS DISTINCT FROM _old.account_holder THEN _changed := array_append(_changed, 'account_holder'); END IF;
  IF _new.account_number IS DISTINCT FROM _old.account_number THEN _changed := array_append(_changed, 'account_number'); END IF;
  IF _new.account_type IS DISTINCT FROM _old.account_type THEN _changed := array_append(_changed, 'account_type'); END IF;
  IF _new.routing_number IS DISTINCT FROM _old.routing_number THEN _changed := array_append(_changed, 'routing_number'); END IF;
  IF _new.swift_code IS DISTINCT FROM _old.swift_code THEN _changed := array_append(_changed, 'swift_code'); END IF;
  IF _new.extra_instructions IS DISTINCT FROM _old.extra_instructions THEN _changed := array_append(_changed, 'extra_instructions'); END IF;
  IF _new.sort_order IS DISTINCT FROM _old.sort_order THEN _changed := array_append(_changed, 'sort_order'); END IF;
  IF _new.is_active IS DISTINCT FROM _old.is_active THEN _changed := array_append(_changed, 'is_active'); END IF;

  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, currency, details)
  VALUES (NULL, _actor, 'bank_account_updated', _new.currency,
          jsonb_build_object('bank_account_id', _new.id, 'label', _new.label, 'changed', to_jsonb(_changed)));
  RETURN _new.id;
END;
$function$;

-- Activate / deactivate. No-op (and no audit row) when already in that state.
-- Activating a second account for a currency raises 23505.
CREATE OR REPLACE FUNCTION public.set_platform_bank_account_active(_actor uuid, _id uuid, _active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row platform_bank_accounts%ROWTYPE;
BEGIN
  PERFORM assert_platform_fee_super_admin(_actor);
  IF _active IS NULL THEN
    RAISE EXCEPTION 'Active flag is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM platform_bank_accounts WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.is_active = _active THEN
    RETURN false;
  END IF;

  UPDATE platform_bank_accounts
     SET is_active = _active, updated_by = _actor, updated_at = now()
   WHERE id = _id;

  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, currency, details)
  VALUES (NULL, _actor, CASE WHEN _active THEN 'bank_account_activated' ELSE 'bank_account_deactivated' END,
          _row.currency, jsonb_build_object('bank_account_id', _row.id, 'label', _row.label));
  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION
  public.save_platform_bank_account(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, boolean),
  public.set_platform_bank_account_active(uuid, uuid, boolean)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.save_platform_bank_account(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, boolean),
  public.set_platform_bank_account_active(uuid, uuid, boolean)
TO service_role;
