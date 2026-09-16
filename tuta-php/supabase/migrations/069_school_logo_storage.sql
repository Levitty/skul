-- ============================================================================
-- 069: School logo storage bucket  (Settings → School Profile)
--
-- Lets the School Profile page upload a PNG / JPG / WEBP / SVG instead of
-- pasting a URL. The bucket is PUBLIC so the returned URL works directly in
-- <img src="…"> with no auth handshake.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'school-logos',
    'school-logos',
    true,                              -- public reads, no auth needed
    2097152,                           -- 2 MB cap matched by the PHP validator
    ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
   SET public             = EXCLUDED.public,
       file_size_limit    = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;
