-- ============================================================================
-- 072: Teacher assignments  (class teachers + subject teachers)
--
-- Today "Teacher" is only a job title (role). The system has no record of
-- which teacher actually teaches which class or subject — so it can't show a
-- teacher their classes, can't gate marks/remarks to the right teacher, and
-- can't populate the class-teacher remark from the assigned class teacher.
--
-- This migration adds:
--   1. classes.class_teacher_id  — the assigned class teacher (a user).
--   2. subject_teachers          — per (class, subject) the assigned teacher.
--
-- One teacher per (class, subject) — UNIQUE on (school_id, class_id, subject_id).
-- Co-teaching can be modelled later by relaxing this constraint.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================================

-- ── Class teacher ──────────────────────────────────────────────────────────
ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS class_teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classes_class_teacher ON classes(class_teacher_id);


-- ── Subject teachers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subject_teachers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID NOT NULL REFERENCES schools(id)    ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id   UUID NOT NULL REFERENCES classes(id)    ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id)   ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subject_teachers_class_subject_unique
    ON subject_teachers(school_id, class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_teachers_user   ON subject_teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_subject_teachers_school ON subject_teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_subject_teachers_class  ON subject_teachers(class_id);

ALTER TABLE subject_teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subject_teachers_school_access" ON subject_teachers;
CREATE POLICY "subject_teachers_school_access" ON subject_teachers
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
  );
