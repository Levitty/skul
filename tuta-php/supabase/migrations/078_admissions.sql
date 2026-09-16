-- ─────────────────────────────────────────────────────────────────
-- Migration 078: Digital admissions (QR / iPad self-service)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- Backs the public admission form (?route=admit) and the staff review queue
-- (?route=admissions). A parent reads the rules, ticks to accept (the exact
-- rules version + timestamp + typed name are stored for the record), fills in
-- student + guardian details, and submits. Staff review and, on approval,
-- convert the row into a real student.
--
-- Rules text itself lives in school_settings (admission_rules /
-- admission_rules_version) — no table needed for that.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admissions (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected')),

    -- Student
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    gender                TEXT,
    dob                   DATE,
    grade_applying        TEXT,
    previous_school       TEXT,

    -- Guardian
    guardian_name         TEXT,
    guardian_phone        TEXT,
    guardian_email        TEXT,
    guardian_id           TEXT,
    guardian_relationship TEXT,

    -- Consent (legal record of what was agreed, when, and by whom)
    consent_accepted      BOOLEAN NOT NULL DEFAULT false,
    consent_name          TEXT,
    consent_at            TIMESTAMPTZ,
    rules_version         INT,

    -- Meta
    source_ip             TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at           TIMESTAMPTZ,
    reviewed_by           TEXT,
    created_student_id    UUID
);

CREATE INDEX IF NOT EXISTS idx_admissions_school ON admissions(school_id, status, created_at DESC);

ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_admissions" ON admissions;
CREATE POLICY "srv_admissions" ON admissions FOR ALL USING (true);
