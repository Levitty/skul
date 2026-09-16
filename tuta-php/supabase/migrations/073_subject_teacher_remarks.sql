-- ============================================================================
-- 073: Per-subject teacher remarks on report cards
--
-- A subject teacher needs somewhere to write a remark about a student for the
-- subject they teach — distinct from the class-teacher's overall remark
-- (which already lives in report_cards.teacher_remarks).
--
-- We add the column to report_card_subjects. When a subject has multiple exam
-- rows for the same (card, subject) — Opener, Midterm, End Term — the PHP
-- write path stamps the same remark on all of them so reading any one yields
-- the current text. The display takes the first non-empty value per subject.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE report_card_subjects
    ADD COLUMN IF NOT EXISTS teacher_remarks TEXT;
