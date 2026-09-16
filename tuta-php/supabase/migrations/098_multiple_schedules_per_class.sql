-- Migration 098: Allow multiple fee schedules per class + term.
--
-- WHY:
--   Schools bill NEW students differently from CONTINUING students in the same
--   class (new students also pay admission / registration / uniform, etc.).
--   Until now a UNIQUE index enforced ONE schedule per (school, class, term),
--   so a second PP2 schedule was rejected with a duplicate-key error.
--
-- WHAT:
--   Drop that class+term uniqueness. Schedules stay distinguishable and safe:
--     • fee_groups still UNIQUE on (school_id, academic_year_id, name) — every
--       schedule must have a distinct NAME within the year (e.g.
--       "PP2 New — Term 3 2026" vs "PP2 Continuing — Term 3 2026").
--     • invoices still UNIQUE on (school_id, student_id, fee_group_id, term_id)
--       — a student can never be billed twice under the SAME schedule in a term.
--   Invoice generation already targets an explicit list of students under a
--   chosen schedule, so the front office simply generates each schedule for the
--   right group of students.
--
-- SAFE / REVERSIBLE: only drops an index; no data touched. To restore the old
--   one-per-class rule, recreate the index (will fail if duplicates now exist).

DROP INDEX IF EXISTS idx_fee_groups_unique_class_term;

-- Verify:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'fee_groups';
--   -- idx_fee_groups_unique_class_term should be GONE;
--   -- fee_groups_school_id_academic_year_id_name_key should REMAIN.
