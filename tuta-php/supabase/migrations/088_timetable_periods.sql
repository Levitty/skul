-- ─────────────────────────────────────────────────────────────────
-- Migration 088: Bell schedule (shared periods) + clash detection support
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor, then Reload Schema Cache. Idempotent.
--
-- A school-wide "bell schedule" of periods (P1, P2, Break, …). Lesson slots
-- snap to a period instead of carrying freeform times, which makes the weekly
-- grid a real period×day matrix and lets us detect a teacher being double-
-- booked (same day + same period in two classes) with a simple equality check.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_periods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID NOT NULL,
    position   INT  NOT NULL DEFAULT 0,        -- ordering within the day
    label      TEXT NOT NULL,                  -- 'P1', 'Break', 'Lunch', …
    start_time TIME,
    end_time   TIME,
    is_break   BOOLEAN NOT NULL DEFAULT FALSE, -- breaks/lunch hold no lessons
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_school
    ON timetable_periods (school_id, position);

ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_timetable_periods" ON timetable_periods;
CREATE POLICY "srv_timetable_periods" ON timetable_periods
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Link each lesson slot to a period (nullable: legacy freeform slots keep NULL).
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS period_id UUID;
CREATE INDEX IF NOT EXISTS idx_timetable_slots_clash
    ON timetable_slots (school_id, day_of_week, period_id);
