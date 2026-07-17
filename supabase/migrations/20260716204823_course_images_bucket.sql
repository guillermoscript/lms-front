-- Storage bucket for course thumbnails/images, uploaded by teachers/admins.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-images',
  'course-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (thumbnails render on public catalog pages)
CREATE POLICY "Public read access for course images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-images');

-- Authenticated users can upload only into this bucket;
-- role/tenant gating (teacher/admin, tenant folder) is enforced in the server action.
CREATE POLICY "Authenticated users can upload course images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can delete course images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'course-images'
    AND auth.role() = 'authenticated'
  );
