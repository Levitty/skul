-- ============================================================================
-- 079: Admission documents storage bucket (rules & regulations PDF / Word)
--
-- Lets a school upload a PDF or Word document for the admission rules &
-- regulations instead of (or in addition to) pasting text. Public bucket so
-- the returned URL opens directly for parents on the admission form.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'admission-docs',
    'admission-docs',
    true,                              -- public reads, no auth needed
    10485760,                          -- 10 MB cap (matched by the PHP validator)
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
)
ON CONFLICT (id) DO UPDATE
   SET public             = EXCLUDED.public,
       file_size_limit    = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;
