-- ─────────────────────────────────────────────────────────────────
-- Migration 091: Bank / M-Pesa statement importer
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor, then Settings → API →
-- Reload Schema Cache.
--
-- Supports the "import a statement → draft expenses" flow. The school
-- exports its M-Pesa Business / bank statement as CSV, uploads it, and
-- each OUTGOING line becomes an expense the bursar just categorises.
-- The expense insert then auto-posts to the ledger (migration 090).
--
-- Two small tables:
--   * imported_txns       — dedup guard: remembers which statement lines
--                           have already been turned into expenses, so
--                           re-uploading the same statement can't double up.
--   * statement_payee_rules — auto-categorisation memory: once you file
--                           "KPLC" as Utilities, the next KPLC line is
--                           pre-selected as Utilities.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS imported_txns (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID NOT NULL,
    txn_ref    TEXT NOT NULL,              -- M-Pesa receipt / bank ref, or a hash of date+amount+desc
    expense_id UUID,                       -- the expense we created from this line
    source     TEXT,                       -- 'mpesa' | 'bank'
    amount     NUMERIC(14,2),
    txn_date   DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, txn_ref)
);
CREATE INDEX IF NOT EXISTS idx_imptxn_school ON imported_txns(school_id);

CREATE TABLE IF NOT EXISTS statement_payee_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL,
    payee_key   TEXT NOT NULL,             -- normalised payee (lowercased, digits/punctuation stripped)
    category_id UUID NOT NULL,
    hits        INT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, payee_key)
);
CREATE INDEX IF NOT EXISTS idx_payeerule_school ON statement_payee_rules(school_id);

-- ── RLS (service-role only, matching existing convention) ─────────
ALTER TABLE imported_txns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_payee_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_imported_txns"         ON imported_txns;
DROP POLICY IF EXISTS "srv_statement_payee_rules" ON statement_payee_rules;
CREATE POLICY "srv_imported_txns"         ON imported_txns         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srv_statement_payee_rules" ON statement_payee_rules FOR ALL USING (true) WITH CHECK (true);
