-- ─────────────────────────────────────────────────────────────────
-- Migration 077: Public enquiry inbox
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- Backs the front-facing enquiry form (?route=enquire) and the staff
-- moderation inbox (?route=enquiries). Spam is filtered at submit time
-- (honeypot + time-trap + optional Turnstile); borderline items are
-- stored with status='spam' rather than dropped, so nothing genuine is
-- lost to an over-eager filter.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enquiries (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    phone          TEXT,
    email          TEXT,
    child_name     TEXT,
    grade_interest TEXT,
    message        TEXT,
    status         TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','contacted','converted','spam','archived')),
    spam_score     INT  NOT NULL DEFAULT 0,
    source_ip      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_school ON enquiries(school_id, status, created_at DESC);

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_enquiries" ON enquiries;
CREATE POLICY "srv_enquiries" ON enquiries FOR ALL USING (true);
