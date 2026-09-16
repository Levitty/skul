-- Migration 054: Ensure student_transport & student_activities have school_id
-- Run in Supabase Dashboard → SQL Editor (without RLS)
-- After running: Settings → API → Reload Schema Cache

-- ============================================
-- 1. student_transport: add school_id
-- ============================================
ALTER TABLE student_transport
    ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- Backfill from the route's school_id
UPDATE student_transport st
SET school_id = tr.school_id
FROM transport_routes tr
WHERE st.route_id = tr.id
  AND st.school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_transport_school
    ON student_transport (school_id, student_id);

-- ============================================
-- 2. student_activities: add school_id
-- ============================================
ALTER TABLE student_activities
    ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- Backfill from the activity's school_id
UPDATE student_activities sa
SET school_id = a.school_id
FROM activities a
WHERE sa.activity_id = a.id
  AND sa.school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_activities_school
    ON student_activities (school_id, student_id);
