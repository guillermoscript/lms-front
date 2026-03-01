-- Add onboarding_completed column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Insert branding-related system settings
INSERT INTO public.system_settings (setting_key, setting_value, category, description)
VALUES
  ('logo_url', '{"value": ""}'::jsonb, 'general', 'Platform logo URL'),
  ('primary_color', '{"value": "#2563eb"}'::jsonb, 'general', 'Primary brand color'),
  ('secondary_color', '{"value": "#7c3aed"}'::jsonb, 'general', 'Secondary brand color'),
  ('favicon_url', '{"value": ""}'::jsonb, 'general', 'Favicon URL')
ON CONFLICT (setting_key) DO NOTHING;
