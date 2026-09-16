-- ─────────────────────────────────────────────────────────────────
-- Migration 129: enquiries — from an inbox to a pipeline
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- An enquiry is the top of the funnel that ends in a fee-paying learner.
-- The table held a name and a status. Now it holds where the enquiry came
-- from, who owns it, when to follow up, what happened, and which admission
-- and learner it became — so a school can see its conversion, and a director
-- can compare branches on it.
--
-- WHAT
--   enquiries       + source, child_dob, assigned_to/_email, follow_up_at,
--                     contacted_at, lost_reason, admission_id, student_id,
--                     last_activity_at; wider status set
--   enquiry_notes   the timeline ("called, mum will visit Thursday")
--
-- Statuses: new → contacted → visit_booked → applied → admitted | lost
--           (+ spam, archived). 'converted' from the old set maps to admitted.
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE enquiries
    ADD COLUMN IF NOT EXISTS source           TEXT,          -- website | whatsapp | walk_in | phone | referral | other
    ADD COLUMN IF NOT EXISTS source_page      TEXT,          -- which web page, when website
    ADD COLUMN IF NOT EXISTS child_dob        DATE,
    ADD COLUMN IF NOT EXISTS assigned_to      UUID,
    ADD COLUMN IF NOT EXISTS assigned_email   TEXT,
    ADD COLUMN IF NOT EXISTS follow_up_at     DATE,
    ADD COLUMN IF NOT EXISTS contacted_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lost_reason      TEXT,
    ADD COLUMN IF NOT EXISTS admission_id     UUID,
    ADD COLUMN IF NOT EXISTS student_id       UUID,
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now();

-- Widen the status check (drop whatever the old constraint was called).
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
              WHERE t.relname = 'enquiries' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;
UPDATE enquiries SET status = 'admitted' WHERE status = 'converted';
ALTER TABLE enquiries
    ADD CONSTRAINT enquiries_status_check
    CHECK (status IN ('new', 'contacted', 'visit_booked', 'applied', 'admitted', 'lost', 'spam', 'archived'));
UPDATE enquiries SET source = 'website' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_school_status ON enquiries(school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_follow_up ON enquiries(school_id, follow_up_at) WHERE follow_up_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS enquiry_notes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    enquiry_id   UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
    author_email TEXT,
    kind         TEXT NOT NULL DEFAULT 'note',   -- note | status | assign | follow_up | system
    body         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enquiry_notes_enquiry ON enquiry_notes(enquiry_id, created_at DESC);
ALTER TABLE enquiry_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_enquiry_notes" ON enquiry_notes;
CREATE POLICY "srv_enquiry_notes" ON enquiry_notes FOR ALL USING (true);

-- Link from an admission back to the enquiry it came from.
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS enquiry_id UUID;
