-- ============================================================================
-- 067: Term report cards  (Examination module — Phase 2)
--
-- Re-keys report cards from one-per-exam to one-per-TERM, so a single report
-- card covers every exam a student sat that term (Opener, Midterm, End Term…).
-- Subject marks are now recorded per exam, so the card can show each exam
-- side by side.
--
-- Also ensures the `invitations` table exists — the new Staff & Roles tab
-- depends on it.
--
-- Idempotent. Run the whole file once in the Supabase SQL editor.
-- ============================================================================


-- The earlier per-exam report cards are now the wrong shape (the model is
-- per-term). They were only ever test data — the examination module did not
-- function before this set of changes — so clearing them is safe and makes
-- the re-key clean. (This cascades to report_card_subjects.)
DELETE FROM report_cards;

-- report_cards: one card per student per term.
DROP INDEX IF EXISTS report_cards_student_exam_key;
CREATE UNIQUE INDEX IF NOT EXISTS report_cards_student_term_key
    ON report_cards (student_id, term_id);

-- report_card_subjects: a subject's marks are now recorded per exam.
ALTER TABLE report_card_subjects
    ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES exams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_report_card_subjects_exam
    ON report_card_subjects (exam_id);


-- ── Safety net: the invitations table ───────────────────────────────────────
-- The Staff & Roles tab (Settings) creates invitations. Migration 048 defines
-- this table, but — like 024 and 044 — it may never have been applied. Ensure
-- it exists so inviting staff works.
CREATE TABLE IF NOT EXISTS invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    school_id   UUID REFERENCES schools(id),
    school_name TEXT,
    role        TEXT DEFAULT 'teacher',
    token       TEXT NOT NULL UNIQUE,
    invited_by  UUID,
    accepted_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_invitations" ON invitations;
CREATE POLICY "srv_invitations" ON invitations FOR ALL USING (true);
