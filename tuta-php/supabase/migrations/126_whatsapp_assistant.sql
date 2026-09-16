-- ─────────────────────────────────────────────────────────────────
-- Migration 126: WhatsApp parent assistant — conversations + log
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- Reminders go out (mig. 125). Now parents can talk BACK: message the
-- school's number, see each child's balance, tap Pay, get an M-Pesa prompt,
-- get a receipt — all inside Meta's free 24-hour service window because the
-- parent starts it.
--
-- WHAT
--   • wa_conversations — one row per (school, phone): where the parent is in
--     the flow (idle / choosing learner / entering amount…) and what it's about
--   • wa_messages      — every inbound and outbound message, for support and audit
--   • mpesa_stk_requests.source / wa_phone — so the M-Pesa callback knows a
--     prompt came from WhatsApp and can confirm back on WhatsApp
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wa_conversations (
    school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    phone       TEXT NOT NULL,                       -- E.164 digits, e.g. 2547XXXXXXXX
    state       TEXT NOT NULL DEFAULT 'idle',
    context     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {student_id, invoice_id, …}
    last_in_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (school_id, phone)
);
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_wa_conversations" ON wa_conversations;
CREATE POLICY "srv_wa_conversations" ON wa_conversations FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS wa_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     UUID REFERENCES schools(id) ON DELETE CASCADE,
    phone         TEXT,
    direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    kind          TEXT,                              -- text | interactive | button | template | status | error
    body          JSONB,                             -- what was received / sent (trimmed)
    wa_message_id TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_school_time ON wa_messages(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone ON wa_messages(phone, created_at DESC);
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_wa_messages" ON wa_messages;
CREATE POLICY "srv_wa_messages" ON wa_messages FOR ALL USING (true);

ALTER TABLE mpesa_stk_requests
    ADD COLUMN IF NOT EXISTS source   TEXT,          -- 'portal' | 'office' | 'whatsapp'
    ADD COLUMN IF NOT EXISTS wa_phone TEXT;          -- where to send the WhatsApp confirmation
