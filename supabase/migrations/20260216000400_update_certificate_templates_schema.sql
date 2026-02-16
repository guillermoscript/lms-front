-- Migration: Update Certificate Templates Schema
-- Description: Aligns table columns with frontend field names

ALTER TABLE public.certificate_templates RENAME COLUMN name TO template_name;
ALTER TABLE public.certificate_templates RENAME COLUMN achievement_criteria_narrative TO issuance_criteria;
ALTER TABLE public.certificate_templates RENAME COLUMN design_config TO design_settings;

-- Add missing columns
ALTER TABLE public.certificate_templates ADD COLUMN IF NOT EXISTS issuer_name VARCHAR(255);
ALTER TABLE public.certificate_templates ADD COLUMN IF NOT EXISTS issuer_url TEXT;

-- Update RLS policies to use new column names (though most were using course_id which didn't change)
-- No changes needed to policies as they reference table name and course_id.
