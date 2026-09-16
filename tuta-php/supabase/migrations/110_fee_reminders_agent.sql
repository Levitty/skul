-- ─────────────────────────────────────────────────────────────────
-- Migration 110: Fee reminders — the ARREARS FOLLOW-UP AGENT (the first
--                read-objects → propose → human-gate agent on the ontology).
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- The agent contract (paper §11, ontology spec §10): it READS Invoice, Payment
-- and Guardian objects, DRAFTS a personalised reminder per overdue invoice,
-- and PROPOSES sending. The bursar reviews and approves in a batch — nothing
-- reaches a parent without a human decision, and every decision is audited.
-- Drafts cite their objects (invoice_id, student_id) so any message traces
-- back to its sources.
--
-- Sending: until the WhatsApp channel is configured, "approved" messages are
-- surfaced for copy-and-send and can be marked sent; when Meta goes live the
-- same rows feed the automatic sender unchanged.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_reminders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    batch_id       UUID NOT NULL,
    invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    guardian_name  TEXT,
    guardian_phone TEXT,
    balance        NUMERIC(12,2) NOT NULL,
    days_overdue   INT,
    message        TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'approved', 'dismissed', 'sent')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by     TEXT,
    decided_at     TIMESTAMPTZ
);
ALTER TABLE fee_reminders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fee_reminders_school_status
    ON fee_reminders(school_id, status, created_at DESC);
-- One live draft per invoice at a time (re-drafting replaces, not duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_reminders_draft_unique
    ON fee_reminders(invoice_id) WHERE status = 'draft';

-- ── The human gate: decide a batch of proposals atomically ────────────────
-- p_decision: 'approved' (draft→approved) | 'dismissed' (draft→dismissed)
--           | 'sent' (approved→sent, after the bursar has actually sent them)
CREATE OR REPLACE FUNCTION decide_fee_reminders(
    p_school_id  UUID,
    p_ids        JSONB,          -- array of fee_reminders uuid strings
    p_decision   TEXT,
    p_user_id    UUID    DEFAULT NULL,
    p_user_email TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_count INT := 0;
BEGIN
    IF p_decision NOT IN ('approved', 'dismissed', 'sent') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid decision.');
    END IF;

    UPDATE fee_reminders
       SET status = p_decision,
           decided_by = p_user_email,
           decided_at = now()
     WHERE school_id = p_school_id
       AND id IN (SELECT j::uuid FROM jsonb_array_elements_text(COALESCE(p_ids, '[]'::jsonb)) AS t(j))
       AND status = CASE WHEN p_decision = 'sent' THEN 'approved' ELSE 'draft' END;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'fee_reminders_' || p_decision, 'fee_reminders', NULL,
            jsonb_build_object('decision', p_decision, 'count', v_count, 'ids', p_ids));

    RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$fn$;
