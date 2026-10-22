-- Invitations are consumed by SECRET TOKEN, not by email match.
--
-- Until now `joinSchool` accepted a pending invitation for anyone whose
-- account email equalled the invited address. Sign-up does not require a
-- verified email, so whoever registered the invitee's address first captured
-- the invited role (teacher). The invitation now carries an unguessable token
-- that only travels in the emailed / shared link (`/join-school?invite=<token>`),
-- and an invitation is consumed only when the token AND the account email match.
--
-- Breaking by design: invitations that are pending today get a token nobody has
-- received, so they are unusable until the admin invites again (re-inviting a
-- pending address rotates its token).

-- 128+ bits of CSPRNG output without depending on pgcrypto's schema:
-- gen_random_uuid() is core Postgres (13+). Two v4 UUIDs, dashes stripped.
ALTER TABLE public.tenant_invitations
  ADD COLUMN IF NOT EXISTS token text NOT NULL
    DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL
    DEFAULT (now() + interval '14 days');

CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitations_token_key
  ON public.tenant_invitations (token);

-- `UNIQUE (tenant_id, email, status)` meant a second *accepted* (or expired)
-- row for the same address violated the constraint, which silently broke the
-- bookkeeping UPDATE on a re-invite. The intent was only "one PENDING invite
-- per email per tenant".
ALTER TABLE public.tenant_invitations
  DROP CONSTRAINT IF EXISTS tenant_invitations_tenant_id_email_status_key;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitations_one_pending_per_email
  ON public.tenant_invitations (tenant_id, email)
  WHERE status = 'pending';

-- RLS is unchanged and is what keeps tokens private: the only policies on this
-- table are "tenant admins manage their own tenant's rows" and service_role.
-- Students, teachers and the invitee themself cannot SELECT a token.
-- (anon/authenticated still hold table GRANTs, as everywhere in this schema;
-- with RLS enabled and no matching policy they see zero rows.)
