-- ─────────────────────────────────────────────────────────────────
-- Migration 109: Payroll → ledger bridge (dry well #3 from the Data Census)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- Payroll (60–75% of a school's spend) lives in the separate HR system and
-- never reaches the OPS ledger — so the P&L overstates profit by the school's
-- largest cost. This bridge posts ONE balanced journal per school per month,
-- entered by the bursar from the HR payroll run (an automated HR→OPS feed can
-- replace the typing later; the posting shape stays identical).
--
-- The journal (the chart already has the accounts, seeded in mig. 090):
--   run:        DEBIT 5000 Salaries & Wages (gross)
--               CREDIT 2200 Statutory Liabilities (PAYE/NSSF/SHA withheld)
--               CREDIT cash account (net actually paid out)
--   remittance: DEBIT 2200, CREDIT cash — when the statutory is later paid to KRA/NSSF/SHA.
--
-- Idempotent per (school, period) via payroll_postings; post_journal's own
-- (source_type, source_id) guard makes re-runs safe. source_type 'payroll'
-- was reserved for exactly this in mig. 090.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_postings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    period        TEXT NOT NULL,                -- 'YYYY-MM'
    gross_pay     NUMERIC(14,2) NOT NULL,
    statutory     NUMERIC(14,2) NOT NULL DEFAULT 0,   -- PAYE + NSSF + SHA withheld
    net_paid      NUMERIC(14,2) NOT NULL,
    payment_method TEXT DEFAULT 'bank',
    note          TEXT,
    posted_by     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_id, period)
);
ALTER TABLE payroll_postings ENABLE ROW LEVEL SECURITY;

-- ── Action: post one month's payroll into the books ────────────────────────
CREATE OR REPLACE FUNCTION record_payroll_run(
    p_school_id  UUID,
    p_period     TEXT,                 -- 'YYYY-MM'
    p_gross      NUMERIC,
    p_statutory  NUMERIC DEFAULT 0,
    p_net        NUMERIC DEFAULT NULL, -- omitted → gross - statutory
    p_method     TEXT    DEFAULT 'bank',
    p_note       TEXT    DEFAULT NULL,
    p_user_id    UUID    DEFAULT NULL,
    p_user_email TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_id    UUID;
    v_net   NUMERIC(14,2);
    v_stat  NUMERIC(14,2) := COALESCE(p_statutory, 0);
    v_cash  TEXT;
    v_lines JSONB;
    v_date  DATE;
BEGIN
    IF p_period IS NULL OR p_period !~ '^\d{4}-\d{2}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Period must be YYYY-MM.');
    END IF;
    IF p_gross IS NULL OR p_gross <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A valid gross amount is required.');
    END IF;
    IF v_stat < 0 OR v_stat > p_gross THEN
        RETURN jsonb_build_object('success', false, 'error', 'Statutory must be between 0 and gross.');
    END IF;
    v_net := COALESCE(p_net, p_gross - v_stat);
    IF ABS((v_net + v_stat) - p_gross) > 0.01 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Net + statutory must equal gross.');
    END IF;
    IF EXISTS (SELECT 1 FROM payroll_postings WHERE school_id = p_school_id AND period = p_period) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payroll for ' || p_period || ' is already posted.');
    END IF;

    INSERT INTO payroll_postings (school_id, period, gross_pay, statutory, net_paid, payment_method, note, posted_by)
    VALUES (p_school_id, p_period, p_gross, v_stat, v_net, COALESCE(p_method, 'bank'), NULLIF(p_note, ''), p_user_email)
    RETURNING id INTO v_id;

    v_cash  := cash_account_code(COALESCE(p_method, 'bank'));
    v_date  := (p_period || '-28')::date;   -- posted at month end
    v_lines := jsonb_build_array(
        jsonb_build_object('code', '5000', 'debit', p_gross, 'credit', 0, 'memo', 'Payroll ' || p_period || ' — gross'),
        jsonb_build_object('code', '2200', 'debit', 0, 'credit', v_stat,  'memo', 'Statutory withheld (PAYE/NSSF/SHA)'),
        jsonb_build_object('code', v_cash, 'debit', 0, 'credit', v_net,   'memo', 'Net salaries paid'));
    -- Zero statutory → drop the empty line (post_journal skips zero-only journals, not lines).
    IF v_stat = 0 THEN
        v_lines := jsonb_build_array(v_lines->0, v_lines->2);
    END IF;
    PERFORM post_journal(p_school_id, v_date, 'Payroll ' || p_period, 'payroll', v_id, v_lines, p_user_id);

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'record_payroll_run', 'payroll_posting', v_id,
            jsonb_build_object('period', p_period, 'gross', p_gross, 'statutory', v_stat, 'net', v_net));

    RETURN jsonb_build_object('success', true, 'posting_id', v_id,
                              'gross', p_gross, 'statutory', v_stat, 'net', v_net);
END;
$fn$;

-- ── Action: record the later remittance of withheld statutory ──────────────
CREATE OR REPLACE FUNCTION record_statutory_remittance(
    p_school_id  UUID,
    p_amount     NUMERIC,
    p_date       DATE    DEFAULT NULL,
    p_method     TEXT    DEFAULT 'bank',
    p_note       TEXT    DEFAULT NULL,
    p_user_id    UUID    DEFAULT NULL,
    p_user_email TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_cash TEXT;
    v_id   UUID := gen_random_uuid();
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A valid amount is required.');
    END IF;
    v_cash := cash_account_code(COALESCE(p_method, 'bank'));
    PERFORM post_journal(p_school_id, COALESCE(p_date, CURRENT_DATE),
        'Statutory remittance' || COALESCE(' — ' || NULLIF(p_note, ''), ''),
        'payroll', v_id,
        jsonb_build_array(
            jsonb_build_object('code', '2200', 'debit', p_amount, 'credit', 0, 'memo', 'Statutory remitted (KRA/NSSF/SHA)'),
            jsonb_build_object('code', v_cash, 'debit', 0, 'credit', p_amount, 'memo', 'Statutory paid out')),
        p_user_id);

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'record_statutory_remittance', 'ledger_entry', v_id,
            jsonb_build_object('amount', p_amount, 'date', COALESCE(p_date, CURRENT_DATE)));

    RETURN jsonb_build_object('success', true, 'amount', p_amount);
END;
$fn$;
