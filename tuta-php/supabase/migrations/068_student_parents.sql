-- ============================================================================
-- 068: Parent portal — student_parents link table  (Parent Portal — v1)
--
-- An explicit link between a parent's login account and the students that are
-- their children. Rows are created when a parent is invited (matched by the
-- guardian phone already on the student record). Portal access reads these
-- exact rows — never fuzzy phone matching at request time.
--
-- Idempotent. Run the whole file once in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_parents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id      UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
    parent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (parent_user_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_parents_parent  ON student_parents(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_student_parents_student ON student_parents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_parents_school  ON student_parents(school_id);

-- RLS: a parent sees only their own link rows; school staff see their school's.
ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_parents_parent_access" ON student_parents;
CREATE POLICY "student_parents_parent_access" ON student_parents
  FOR ALL USING (
    parent_user_id = auth.uid()
    OR school_id IN (
      SELECT school_id FROM user_schools WHERE user_id = auth.uid()
    )
  );

-- A parent invitation carries the children to link (comma-separated student
-- ids). When the parent accepts, the student_parents rows are created from it.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS link_student_ids TEXT;
