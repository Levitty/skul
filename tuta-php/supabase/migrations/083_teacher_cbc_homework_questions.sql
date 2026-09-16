-- ─────────────────────────────────────────────────────────────────
-- Migration 083: CBC lesson plans + homework attachments + question bank
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor. After: Reload Schema Cache. Idempotent.
-- ─────────────────────────────────────────────────────────────────

-- ── 1. Lesson plans → CBC fields ──────────────────────────────────
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS strand             TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS sub_strand         TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS learning_outcomes  TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS key_inquiry        TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS learning_resources TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS organisation       TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS introduction       TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS lesson_dev_1       TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS lesson_dev_2       TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS lesson_dev_3       TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS extended_activities TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS conclusion         TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS reflection         TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS lesson_time        TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS roll               TEXT;

-- ── 2. Homework attachment ────────────────────────────────────────
ALTER TABLE homework ADD COLUMN IF NOT EXISTS attachment_url  TEXT;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- ── 3. Question bank ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
    class_id        UUID REFERENCES classes(id)           ON DELETE SET NULL,
    subject_id      UUID REFERENCES subjects(id)          ON DELETE SET NULL,
    strand          TEXT,
    topic           TEXT,
    type            TEXT NOT NULL DEFAULT 'short'
                    CHECK (type IN ('mcq','short','structured')),
    question_text   TEXT NOT NULL,
    options         JSONB,          -- for MCQ: ["A ...","B ...",...]
    answer          TEXT,
    difficulty      TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
    source          TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher','horeb')),
    created_by      UUID,
    created_by_name TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questions_scope ON questions(school_id, class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_owner ON questions(school_id, created_by);
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_questions" ON questions;
CREATE POLICY "srv_questions" ON questions FOR ALL USING (true);

-- ── 4. Storage bucket for teacher uploads (homework docs, etc.) ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'teacher-docs', 'teacher-docs', true, 10485760,
    ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE
   SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
