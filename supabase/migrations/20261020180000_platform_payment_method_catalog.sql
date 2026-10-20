-- Platform payment methods: platform_bank_accounts learns the same catalog
-- schools already have (#926/#932: Zelle, Binance, PayPal, Zinli, Cash, Pago
-- Movil) next to the original bank transfer.
--
-- Before: every row was a bank account (bank, holder, number all required), so
-- the platform could not publish a Zinli email or a Pago Movil phone to schools
-- paying their platform fee.
--
--   1. `kind` ('bank' default, so every existing row is unchanged) plus `email`
--      and `document` (cedula/RIF for Pago Movil). Binance Pay ID and the Pago
--      Movil phone live in `account_number`, as `identifier` does for schools.
--   2. bank_name / account_holder / account_number become nullable; a CHECK per
--      kind says which ones that kind requires, so a bank row still needs all
--      three and a Zinli row needs only an email.
--   3. One ACTIVE account per (kind, currency) instead of per currency.
--   4. save_platform_bank_account gains _kind/_email/_document (defaulted, so
--      positional callers keep working). Audit rows still hold field names only.

-- ─── 1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.platform_bank_accounts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS document text;

ALTER TABLE public.platform_bank_accounts DROP CONSTRAINT IF EXISTS platform_bank_accounts_kind_valid;
ALTER TABLE public.platform_bank_accounts ADD CONSTRAINT platform_bank_accounts_kind_valid
  CHECK (kind IN ('bank', 'zelle', 'binance', 'paypal', 'zinli', 'cash', 'pago_movil'));

ALTER TABLE public.platform_bank_accounts DROP CONSTRAINT IF EXISTS platform_bank_accounts_email_len;
ALTER TABLE public.platform_bank_accounts ADD CONSTRAINT platform_bank_accounts_email_len
  CHECK (email IS NULL OR (char_length(btrim(email)) BETWEEN 3 AND 254 AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));

ALTER TABLE public.platform_bank_accounts DROP CONSTRAINT IF EXISTS platform_bank_accounts_document_len;
ALTER TABLE public.platform_bank_accounts ADD CONSTRAINT platform_bank_accounts_document_len
  CHECK (document IS NULL OR char_length(btrim(document)) BETWEEN 1 AND 40);

-- ─── 2. Required fields per kind ────────────────────────────────────────────

ALTER TABLE public.platform_bank_accounts
  ALTER COLUMN bank_name DROP NOT NULL,
  ALTER COLUMN account_holder DROP NOT NULL,
  ALTER COLUMN account_number DROP NOT NULL;

ALTER TABLE public.platform_bank_accounts DROP CONSTRAINT IF EXISTS platform_bank_accounts_kind_required;
ALTER TABLE public.platform_bank_accounts ADD CONSTRAINT platform_bank_accounts_kind_required CHECK (
  CASE kind
    WHEN 'bank' THEN bank_name IS NOT NULL AND account_holder IS NOT NULL AND account_number IS NOT NULL
    WHEN 'zelle' THEN email IS NOT NULL
    WHEN 'binance' THEN account_number IS NOT NULL
    WHEN 'paypal' THEN email IS NOT NULL
    WHEN 'zinli' THEN email IS NOT NULL
    WHEN 'cash' THEN extra_instructions IS NOT NULL
    WHEN 'pago_movil' THEN bank_name IS NOT NULL AND account_number IS NOT NULL AND document IS NOT NULL
    ELSE false
  END
);

-- ─── 3. One active account per kind and currency ────────────────────────────

DROP INDEX IF EXISTS public.platform_bank_accounts_one_active_per_currency;
CREATE UNIQUE INDEX IF NOT EXISTS platform_bank_accounts_one_active_per_kind_currency
  ON public.platform_bank_accounts (kind, currency) WHERE is_active;

COMMENT ON TABLE public.platform_bank_accounts IS
  'Issue #929: platform payment accounts (bank transfer, Zelle, Binance, PayPal, Zinli, cash, Pago Movil) schools pay platform fees into. Managed by super admins (/platform/bank-accounts) through save_/set_platform_bank_account*; one active account per kind and currency. Never readable by schools directly.';

-- ─── 4. Write functions ─────────────────────────────────────────────────────

-- The 13-argument signature is replaced, not overloaded: two overloads would
-- make a positional call ambiguous.
DROP FUNCTION IF EXISTS public.save_platform_bank_account(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, boolean);

CREATE OR REPLACE FUNCTION public.save_platform_bank_account(
  _actor uuid,
  _id uuid,
  _currency text,
  _label text,
  _bank_name text DEFAULT NULL,
  _account_holder text DEFAULT NULL,
  _account_number text DEFAULT NULL,
  _account_type text DEFAULT NULL,
  _routing_number text DEFAULT NULL,
  _swift_code text DEFAULT NULL,
  _extra_instructions text DEFAULT NULL,
  _sort_order integer DEFAULT 0,
  _is_active boolean DEFAULT true,
  _kind text DEFAULT 'bank',
  _email text DEFAULT NULL,
  _document text DEFAULT NULL
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
  _k text := lower(btrim(coalesce(_kind, 'bank')));
BEGIN
  PERFORM assert_platform_fee_super_admin(_actor);

  IF _id IS NULL THEN
    INSERT INTO platform_bank_accounts (
      kind, currency, label, bank_name, account_holder, account_number, account_type,
      routing_number, swift_code, email, document, extra_instructions, sort_order, is_active,
      created_by, updated_by
    ) VALUES (
      _k, upper(btrim(coalesce(_currency, ''))), btrim(coalesce(_label, '')),
      NULLIF(btrim(_bank_name), ''), NULLIF(btrim(_account_holder), ''), NULLIF(btrim(_account_number), ''),
      NULLIF(btrim(_account_type), ''), NULLIF(btrim(_routing_number), ''),
      NULLIF(upper(regexp_replace(coalesce(_swift_code, ''), '\s', '', 'g')), ''),
      NULLIF(btrim(_email), ''), NULLIF(btrim(_document), ''),
      NULLIF(btrim(_extra_instructions), ''), coalesce(_sort_order, 0), coalesce(_is_active, true),
      _actor, _actor
    )
    RETURNING * INTO _new;

    INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, currency, details)
    VALUES (NULL, _actor, 'bank_account_created', _new.currency,
            jsonb_build_object('bank_account_id', _new.id, 'label', _new.label, 'kind', _new.kind, 'is_active', _new.is_active));
    RETURN _new.id;
  END IF;

  SELECT * INTO _old FROM platform_bank_accounts WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE platform_bank_accounts SET
    kind = _k,
    currency = upper(btrim(coalesce(_currency, ''))),
    label = btrim(coalesce(_label, '')),
    bank_name = NULLIF(btrim(_bank_name), ''),
    account_holder = NULLIF(btrim(_account_holder), ''),
    account_number = NULLIF(btrim(_account_number), ''),
    account_type = NULLIF(btrim(_account_type), ''),
    routing_number = NULLIF(btrim(_routing_number), ''),
    swift_code = NULLIF(upper(regexp_replace(coalesce(_swift_code, ''), '\s', '', 'g')), ''),
    email = NULLIF(btrim(_email), ''),
    document = NULLIF(btrim(_document), ''),
    extra_instructions = NULLIF(btrim(_extra_instructions), ''),
    sort_order = coalesce(_sort_order, 0),
    is_active = coalesce(_is_active, is_active),
    updated_by = _actor,
    updated_at = now()
  WHERE id = _id
  RETURNING * INTO _new;

  -- Field NAMES only: the audit trail never stores account details.
  IF _new.kind IS DISTINCT FROM _old.kind THEN _changed := array_append(_changed, 'kind'); END IF;
  IF _new.currency IS DISTINCT FROM _old.currency THEN _changed := array_append(_changed, 'currency'); END IF;
  IF _new.label IS DISTINCT FROM _old.label THEN _changed := array_append(_changed, 'label'); END IF;
  IF _new.bank_name IS DISTINCT FROM _old.bank_name THEN _changed := array_append(_changed, 'bank_name'); END IF;
  IF _new.account_holder IS DISTINCT FROM _old.account_holder THEN _changed := array_append(_changed, 'account_holder'); END IF;
  IF _new.account_number IS DISTINCT FROM _old.account_number THEN _changed := array_append(_changed, 'account_number'); END IF;
  IF _new.account_type IS DISTINCT FROM _old.account_type THEN _changed := array_append(_changed, 'account_type'); END IF;
  IF _new.routing_number IS DISTINCT FROM _old.routing_number THEN _changed := array_append(_changed, 'routing_number'); END IF;
  IF _new.swift_code IS DISTINCT FROM _old.swift_code THEN _changed := array_append(_changed, 'swift_code'); END IF;
  IF _new.email IS DISTINCT FROM _old.email THEN _changed := array_append(_changed, 'email'); END IF;
  IF _new.document IS DISTINCT FROM _old.document THEN _changed := array_append(_changed, 'document'); END IF;
  IF _new.extra_instructions IS DISTINCT FROM _old.extra_instructions THEN _changed := array_append(_changed, 'extra_instructions'); END IF;
  IF _new.sort_order IS DISTINCT FROM _old.sort_order THEN _changed := array_append(_changed, 'sort_order'); END IF;
  IF _new.is_active IS DISTINCT FROM _old.is_active THEN _changed := array_append(_changed, 'is_active'); END IF;

  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, currency, details)
  VALUES (NULL, _actor, 'bank_account_updated', _new.currency,
          jsonb_build_object('bank_account_id', _new.id, 'label', _new.label, 'changed', to_jsonb(_changed)));
  RETURN _new.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION
  public.save_platform_bank_account(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, boolean, text, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.save_platform_bank_account(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, boolean, text, text, text)
TO service_role;
