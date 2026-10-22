-- Tenant asset library: one row per file a school has uploaded to a public
-- content bucket (course covers, landing-page images, certificate logos and
-- signatures, community media, AI-generated images).
--
-- Uploads came from five server actions, the MCP server and client-side code,
-- none of which recorded anything, so a school could not see or reuse what it
-- had uploaded. A trigger on storage.objects is the one place every path
-- passes (service role, user JWT, MCP), so the table cannot drift from the
-- buckets. The first path segment of every tracked object is the tenant id.

CREATE TABLE IF NOT EXISTS public.tenant_assets (
  asset_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bucket      text NOT NULL,
  path        text NOT NULL,
  name        text NOT NULL,
  mime_type   text,
  size_bytes  bigint,
  kind        text NOT NULL DEFAULT 'other' CHECK (kind IN ('image', 'video', 'document', 'other')),
  source      text NOT NULL DEFAULT 'other' CHECK (source IN
                ('course', 'landing_page', 'certificate', 'community', 'ai_generated', 'library', 'other')),
  uploaded_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);

CREATE INDEX IF NOT EXISTS tenant_assets_tenant_created_idx
  ON public.tenant_assets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_assets_tenant_kind_idx
  ON public.tenant_assets (tenant_id, kind, source);

ALTER TABLE public.tenant_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read the school's assets" ON public.tenant_assets;
CREATE POLICY "Staff read the school's assets"
  ON public.tenant_assets FOR SELECT TO authenticated
  USING (public.is_staff_of(tenant_id));

-- Rows are written only by the storage trigger below (definer) and the service role.

-- ---------------------------------------------------------------------------
-- Storage INSERT policies: staff of the folder's own school only
-- ---------------------------------------------------------------------------
-- The old policies let ANY authenticated user write anywhere in the bucket
-- (the server actions were the only gate). The library uploads straight from
-- the browser, so the policy itself must pin the first folder to the caller's
-- school. Server actions and the MCP server keep working: the former use the
-- service role, the latter uploads as a staff user into its own tenant folder.
DROP POLICY IF EXISTS "Authenticated users can upload course images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can upload landing page assets" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload into their school folder" ON storage.objects;
CREATE POLICY "Staff upload into their school folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('course-images', 'landing-page-assets')
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_staff_of(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Trigger: mirror storage.objects of the tracked buckets
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_tenant_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _tenant   uuid;
  _mime     text;
  _kind     text;
  _source   text;
  _segments text[];
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.tenant_assets WHERE bucket = OLD.bucket_id AND path = OLD.name;
      RETURN OLD;
    END IF;

    IF NEW.bucket_id NOT IN ('course-images', 'landing-page-assets', 'community-assets') THEN
      RETURN NEW;
    END IF;

    _segments := string_to_array(NEW.name, '/');
    IF _segments[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN NEW;
    END IF;
    _tenant := _segments[1]::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant) THEN
      RETURN NEW;
    END IF;

    _mime := NEW.metadata ->> 'mimetype';
    _kind := CASE
      WHEN _mime LIKE 'image/%' OR NEW.name ~* '\.(jpe?g|png|gif|webp|svg)$' THEN 'image'
      WHEN _mime LIKE 'video/%' OR NEW.name ~* '\.(mp4|webm|mov)$' THEN 'video'
      WHEN _mime = 'application/pdf' OR NEW.name ~* '\.pdf$' THEN 'document'
      ELSE 'other'
    END;
    _source := CASE
      WHEN NEW.bucket_id = 'community-assets' THEN 'community'
      WHEN NEW.bucket_id = 'landing-page-assets' AND _segments[2] = 'certificates' THEN 'certificate'
      WHEN NEW.bucket_id = 'landing-page-assets' AND _segments[2] = 'library' THEN 'library'
      WHEN NEW.bucket_id = 'landing-page-assets' THEN 'landing_page'
      WHEN NEW.bucket_id = 'course-images' AND _segments[2] IS NOT NULL
           AND array_length(_segments, 1) > 2 THEN 'ai_generated'
      WHEN NEW.bucket_id = 'course-images' THEN 'course'
      ELSE 'other'
    END;

    INSERT INTO public.tenant_assets
      (tenant_id, bucket, path, name, mime_type, size_bytes, kind, source, uploaded_by, created_at)
    VALUES (
      _tenant, NEW.bucket_id, NEW.name, _segments[array_length(_segments, 1)], _mime,
      NULLIF(NEW.metadata ->> 'size', '')::bigint, _kind, _source, NEW.owner,
      COALESCE(NEW.created_at, now())
    )
    ON CONFLICT (bucket, path) DO UPDATE
      SET mime_type  = COALESCE(EXCLUDED.mime_type, public.tenant_assets.mime_type),
          size_bytes = COALESCE(EXCLUDED.size_bytes, public.tenant_assets.size_bytes),
          kind       = EXCLUDED.kind;
  EXCEPTION WHEN OTHERS THEN
    -- Bookkeeping must never be the reason an upload or delete fails.
    RAISE WARNING 'sync_tenant_asset failed: %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tenant_asset() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_assets_sync_ins ON storage.objects;
CREATE TRIGGER tenant_assets_sync_ins
  AFTER INSERT OR UPDATE OF metadata ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_asset();

DROP TRIGGER IF EXISTS tenant_assets_sync_del ON storage.objects;
CREATE TRIGGER tenant_assets_sync_del
  AFTER DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_asset();

-- ---------------------------------------------------------------------------
-- Backfill what already exists
-- ---------------------------------------------------------------------------
INSERT INTO public.tenant_assets
  (tenant_id, bucket, path, name, mime_type, size_bytes, kind, source, uploaded_by, created_at)
SELECT
  t.id, o.bucket_id, o.name,
  (string_to_array(o.name, '/'))[array_length(string_to_array(o.name, '/'), 1)],
  o.metadata ->> 'mimetype',
  NULLIF(o.metadata ->> 'size', '')::bigint,
  CASE
    WHEN o.metadata ->> 'mimetype' LIKE 'image/%' OR o.name ~* '\.(jpe?g|png|gif|webp|svg)$' THEN 'image'
    WHEN o.metadata ->> 'mimetype' LIKE 'video/%' OR o.name ~* '\.(mp4|webm|mov)$' THEN 'video'
    WHEN o.name ~* '\.pdf$' THEN 'document'
    ELSE 'other'
  END,
  CASE
    WHEN o.bucket_id = 'community-assets' THEN 'community'
    WHEN o.bucket_id = 'landing-page-assets' AND o.name LIKE '%/certificates/%' THEN 'certificate'
    WHEN o.bucket_id = 'landing-page-assets' AND o.name LIKE '%/library/%' THEN 'library'
    WHEN o.bucket_id = 'landing-page-assets' THEN 'landing_page'
    WHEN o.bucket_id = 'course-images'
         AND array_length(string_to_array(o.name, '/'), 1) > 2 THEN 'ai_generated'
    ELSE 'course'
  END,
  o.owner,
  COALESCE(o.created_at, now())
FROM storage.objects o
JOIN public.tenants t
  ON o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
 AND t.id = (string_to_array(o.name, '/'))[1]::uuid
WHERE o.bucket_id IN ('course-images', 'landing-page-assets', 'community-assets')
  AND o.name NOT LIKE '%/.emptyFolderPlaceholder'
ON CONFLICT (bucket, path) DO NOTHING;
