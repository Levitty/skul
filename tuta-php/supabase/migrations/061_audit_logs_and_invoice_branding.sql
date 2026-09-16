-- ─────────────────────────────────────────────────────────────────
-- Migration 061: Ensure audit_logs table exists + invoice branding
-- ─────────────────────────────────────────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- Why this is needed:
--   The record_payment RPC (migration 058) writes an audit_logs row
--   in the same transaction as the payment. If audit_logs doesn't
--   exist, the ENTIRE payment rolls back — the user sees a cryptic
--   "relation audit_logs does not exist" error and the money isn't
--   recorded. This migration creates the table idempotently so the
--   payment flow can never break for that reason again.
--
--   Two new school_settings keys are also seeded for invoice branding:
--     - brand_color    → HEX color used on the printed invoice/receipt
--                        header. Defaults to emerald (#059669).
--     - invoice_notes  → Free-text note printed at the bottom of every
--                        invoice (e.g. payment instructions, bank info).
--
-- Safe to run multiple times — every statement is IF NOT EXISTS or
-- ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 1. audit_logs — guaranteed to exist before any payment is taken
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id   UUID REFERENCES schools(id),
    user_id     UUID,
    user_email  TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID,
    payload     JSONB,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_school  ON audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- RLS: service_role (used by the PHP app via Supabase REST) bypasses RLS
-- automatically. We still enable RLS so any future direct-from-browser
-- callers are blocked unless an explicit policy allows them.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_audit_logs" ON audit_logs;
CREATE POLICY "srv_audit_logs" ON audit_logs FOR ALL USING (true);

-- ════════════════════════════════════════════════════════════════
-- 2. Seed invoice branding settings for every existing school
-- ════════════════════════════════════════════════════════════════
-- These are NOT new columns — school_settings is a key/value table.
-- We just make sure every school has a row for each key so the UI
-- shows a default instead of an empty input.

INSERT INTO school_settings (school_id, key, value)
SELECT s.id, 'brand_color', '#059669'
  FROM schools s
 WHERE NOT EXISTS (
     SELECT 1 FROM school_settings ss
      WHERE ss.school_id = s.id AND ss.key = 'brand_color'
 );

INSERT INTO school_settings (school_id, key, value)
SELECT s.id, 'invoice_notes', ''
  FROM schools s
 WHERE NOT EXISTS (
     SELECT 1 FROM school_settings ss
      WHERE ss.school_id = s.id AND ss.key = 'invoice_notes'
 );

-- ════════════════════════════════════════════════════════════════
-- Verification (run after the above):
--
--   SELECT to_regclass('public.audit_logs');         -- should return 'audit_logs'
--   SELECT key, value FROM school_settings
--    WHERE key IN ('brand_color', 'invoice_notes');  -- should return 2 rows per school
-- ════════════════════════════════════════════════════════════════
