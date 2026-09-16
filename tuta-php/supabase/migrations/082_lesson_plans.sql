-- ─────────────────────────────────────────────────────────────────
-- Migration 082: Lesson plans / scheme of work (teacher dashboard)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Reload Schema Cache.
--
-- A deterministic place for teachers to plan, store and organise lessons
-- (no AI). Horeb later generates plan content + CBC mapping via API into
-- the same screen. Written create-or-upgrade so it's safe even if a
-- 'lesson_plans' table already exists.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lesson_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS school_id       UUID;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS class_id        UUID;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS subject_id      UUID;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS term_id         UUID;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS title           TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS lesson_date     DATE;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS objectives      TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS activities      TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS resources       TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS notes           TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'planned';
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS created_by      UUID;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lesson_plans_class ON lesson_plans(school_id, class_id, status, lesson_date);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_owner ON lesson_plans(school_id, created_by);

ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_lesson_plans" ON lesson_plans;
CREATE POLICY "srv_lesson_plans" ON lesson_plans FOR ALL USING (true);
