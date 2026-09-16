-- ─────────────────────────────────────────────────────────────────
-- Migration 075: Make audit_logs append-only (R5)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
--
-- Audit findings R5: audit_logs was mutable — its RLS policy is
-- `FOR ALL USING (true)` and there was no constraint preventing rows
-- from being edited or deleted. An audit trail you can rewrite is not
-- an audit trail.
--
-- Verified safe: the codebase only ever INSERTs into audit_logs (40
-- call sites) and never UPDATEs/DELETEs it, so blocking mutation breaks
-- nothing. INSERT is untouched.
--
-- Defence in depth:
--   1. A trigger that raises on any UPDATE / DELETE / TRUNCATE — fires
--      regardless of role (the real protection).
--   2. REVOKE UPDATE/DELETE/TRUNCATE from the app roles.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_logs_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only — % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- Row triggers don't fire on TRUNCATE — guard it with a statement trigger.
DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();

-- Belt-and-suspenders: strip mutation privileges from the app roles.
-- INSERT is intentionally left intact.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC, anon, authenticated;

-- ── Verification (optional) ──────────────────────────────────────
--   UPDATE audit_logs SET action = 'x' WHERE false;   -- should ERROR
--   DELETE FROM audit_logs WHERE false;                -- should ERROR
--   INSERT still works (your app keeps logging normally).
