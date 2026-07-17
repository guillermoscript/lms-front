-- Device push tokens for the mobile app (Expo Push Service).
-- Per-user and global (no tenant_id) — same model as notification_preferences /
-- profiles: tenant scoping happens at send time via notifications.tenant_id
-- targeting, not on the token itself.

CREATE TABLE IF NOT EXISTS device_push_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE, -- ExponentPushToken[...]
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    device_name TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_push_tokens_user_id ON device_push_tokens(user_id);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their push tokens" ON device_push_tokens
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their push tokens" ON device_push_tokens
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- No INSERT/UPDATE policies on purpose: writes go through register_push_token()
-- so a token can be re-claimed when a different account signs in on the same
-- device (a plain RLS upsert cannot update a row owned by another user).
CREATE OR REPLACE FUNCTION register_push_token(
    _token TEXT,
    _platform TEXT,
    _device_name TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;
    IF _platform NOT IN ('ios', 'android') THEN
        RAISE EXCEPTION 'invalid platform: %', _platform;
    END IF;
    IF _token NOT LIKE 'ExponentPushToken[%]' THEN
        RAISE EXCEPTION 'invalid Expo push token format';
    END IF;

    INSERT INTO device_push_tokens (user_id, token, platform, device_name)
    VALUES (auth.uid(), _token, _platform, _device_name)
    ON CONFLICT (token) DO UPDATE
        SET user_id = auth.uid(),
            platform = EXCLUDED.platform,
            device_name = EXCLUDED.device_name,
            last_seen_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION register_push_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_push_token(TEXT, TEXT, TEXT) TO authenticated;
