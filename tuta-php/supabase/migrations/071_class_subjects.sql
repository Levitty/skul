-- ============================================================================
-- 071: Subjects tied to classes
--
-- Today the school has a single global subjects list, and every subject is
-- available in every class — so mark entry and report cards show subjects a
-- given class never sits for.
--
-- This migration introduces (or augments) a class_subjects join table that
-- declares which subjects a class actually takes. The PHP app reads this
-- whenever it lists subjects for a class.
--
-- The legacy Next.js codebase already had a class_subjects table (migration
-- 006). The live DB may or may not have it (schema drift). This migration
-- handles both cases: creates if missing, augments if present.
--
-- BACKWARDS-COMPATIBILITY: we backfill by linking every subject to every
-- class in the same school. So at first run, every class has every subject —
-- exactly today's behaviour. Admins narrow per class from the UI.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_subjects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id    UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
    subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- If the legacy table existed without school_id, add it now.
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS school_id   UUID REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS class_subjects_pair_unique ON class_subjects(class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school ON class_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class  ON class_subjects(class_id);

-- Backfill school_id where missing (legacy rows).
UPDATE class_subjects cs
   SET school_id = c.school_id
  FROM classes c
 WHERE cs.class_id = c.id AND cs.school_id IS NULL;

-- RLS — each school sees only its own links.
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "class_subjects_school_access" ON class_subjects;
CREATE POLICY "class_subjects_school_access" ON class_subjects
  FOR ALL USING (
    school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
  );

-- Backfill the every-subject-everywhere pattern so today's behaviour is
-- preserved. Admins remove what doesn't belong from the new UI.
INSERT INTO class_subjects (school_id, class_id, subject_id, is_required)
SELECT c.school_id, c.id, s.id, true
  FROM classes  c
  JOIN subjects s ON s.school_id = c.school_id
 ON CONFLICT (class_id, subject_id) DO NOTHING;
