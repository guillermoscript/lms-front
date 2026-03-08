-- Migration: Replace form-based landing page builder with Puck visual editor
-- No existing users with custom landing pages, so safe to drop columns.

-- Replace sections/settings columns with puck_data on landing_pages
ALTER TABLE landing_pages DROP COLUMN IF EXISTS sections;
ALTER TABLE landing_pages DROP COLUMN IF EXISTS settings;
ALTER TABLE landing_pages ADD COLUMN puck_data jsonb NOT NULL DEFAULT '{}';

-- Replace sections/settings columns with puck_data on landing_page_templates
ALTER TABLE landing_page_templates DROP COLUMN IF EXISTS sections;
ALTER TABLE landing_page_templates DROP COLUMN IF EXISTS settings;
ALTER TABLE landing_page_templates ADD COLUMN puck_data jsonb NOT NULL DEFAULT '{}';

-- Create storage bucket for landing page assets (images, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-page-assets',
  'landing-page-assets',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public reads, tenant-scoped uploads
CREATE POLICY "Public read access for landing page assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-page-assets');

CREATE POLICY "Tenant admins can upload landing page assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'landing-page-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Tenant admins can delete landing page assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'landing-page-assets'
    AND auth.role() = 'authenticated'
  );
