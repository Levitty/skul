-- ─────────────────────────────────────────────────────────────────
-- Migration 080: Maker-checker approval requests
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- When a school enables approvals, dangerous actions (starting with invoice
-- cancellation) don't execute immediately — they create a pending request
-- here. A DIFFERENT administrator approves (which executes the action) or
-- rejects it. This is the anti-fraud control for an unsupervised front office.
--
-- Generic by design: action_type drives what gets executed on approval, so
-- more gated actions (delete payment, large write-off, …) can be added later
-- without schema changes.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    action_type     TEXT NOT NULL,          -- e.g. 'cancel_invoice'
    target_type     TEXT,                   -- e.g. 'invoice'
    target_id       TEXT,                   -- the affected row's id
    payload         JSONB,                  -- requested change details (reason, etc.)
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
    requested_by    TEXT,                   -- requester email
    requested_by_id UUID,                   -- requester user id (approver must differ)
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_by      TEXT,
    decided_at      TIMESTAMPTZ,
    decision_note   TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_school ON approval_requests(school_id, status, requested_at DESC);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_approval_requests" ON approval_requests;
CREATE POLICY "srv_approval_requests" ON approval_requests FOR ALL USING (true);
