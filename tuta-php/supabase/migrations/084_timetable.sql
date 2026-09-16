-- ─────────────────────────────────────────────────────────────────
-- Migration 084: Timetable slots
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor. After: Reload Schema Cache. Idempotent.
--
-- A flexible weekly timetable: one row per lesson slot (day + time + class +
-- subject). The teacher is denormalised from the subject-teacher assignment
-- at save time so "My Timetable" reads fast. No rigid period config — any
-- start/end time works.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_slots (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS school_id    UUID;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS class_id     UUID;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS day_of_week  SMALLINT;   -- 1=Mon … 7=Sun
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS start_time   TIME;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS end_time     TIME;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS subject_id   UUID;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS teacher_id   UUID;       -- auth.users id
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS teacher_name TEXT;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS room         TEXT;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_timetable_class   ON timetable_slots(school_id, class_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_slots(school_id, teacher_id, day_of_week, start_time);

ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_timetable_slots" ON timetable_slots;
CREATE POLICY "srv_timetable_slots" ON timetable_slots FOR ALL USING (true);
