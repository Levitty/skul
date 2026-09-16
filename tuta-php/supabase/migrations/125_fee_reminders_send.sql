-- ─────────────────────────────────────────────────────────────────
-- Migration 125: fee_reminders — record how each reminder was sent
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- The reminder agent (110) drafted and approved; sending was copy-and-paste.
-- Now Tuta sends approved reminders itself over WhatsApp (Meta Cloud API) or
-- SMS. These columns keep the channel, the provider's message id, and any
-- failure reason per row, so a bursar can see exactly which parent did not
-- get their reminder and why.
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE fee_reminders
    ADD COLUMN IF NOT EXISTS sent_via    TEXT,          -- 'whatsapp' | 'sms' | 'manual'
    ADD COLUMN IF NOT EXISTS provider_id TEXT,          -- Meta message id / SMS provider id
    ADD COLUMN IF NOT EXISTS send_error  TEXT,          -- last failure, cleared on success
    ADD COLUMN IF NOT EXISTS sent_at     TIMESTAMPTZ;
