-- Migration: Replace form-based landing page builder with Puck visual editor
-- No existing users with custom landing pages, so safe to drop columns.

-- Replace sections/settings columns with puck_data on landing_pages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'landing_pages') THEN
    ALTER TABLE landing_pages DROP COLUMN IF EXISTS sections;
    ALTER TABLE landing_pages DROP COLUMN IF EXISTS settings;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'landing_pages' AND column_name = 'puck_data') THEN
      ALTER TABLE landing_pages ADD COLUMN puck_data jsonb NOT NULL DEFAULT '{}';
    END IF;
  ELSE
    CREATE TABLE landing_pages (
      page_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title text NOT NULL,
      slug text NOT NULL,
      is_published boolean NOT NULL DEFAULT false,
      puck_data jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, slug)
    );
    ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Tenant members can view landing pages" ON landing_pages FOR SELECT USING (tenant_id = (SELECT current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid);
    CREATE POLICY "Tenant admins can manage landing pages" ON landing_pages FOR ALL USING (tenant_id = (SELECT current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid);
  END IF;
END $$;

-- Replace sections/settings columns with puck_data on landing_page_templates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'landing_page_templates') THEN
    ALTER TABLE landing_page_templates DROP COLUMN IF EXISTS sections;
    ALTER TABLE landing_page_templates DROP COLUMN IF EXISTS settings;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'landing_page_templates' AND column_name = 'puck_data') THEN
      ALTER TABLE landing_page_templates ADD COLUMN puck_data jsonb NOT NULL DEFAULT '{}';
    END IF;
  ELSE
    CREATE TABLE landing_page_templates (
      template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      puck_data jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

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
