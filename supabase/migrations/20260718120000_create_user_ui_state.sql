-- Per-user UI state for tours, checklists, and tips (issue #452).
-- Global per-user (no tenant_id), matching the profiles / notification_preferences
-- precedent: completing a tour or dismissing a checklist follows the user across
-- tenants and devices. localStorage remains only an optimistic client cache.

CREATE TABLE public.user_ui_state (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_ui_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ui state"
    ON public.user_ui_state FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ui state"
    ON public.user_ui_state FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ui state"
    ON public.user_ui_state FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ui state"
    ON public.user_ui_state FOR DELETE
    USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_user_ui_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER user_ui_state_updated_at
    BEFORE UPDATE ON public.user_ui_state
    FOR EACH ROW
    EXECUTE FUNCTION update_user_ui_state_updated_at();
