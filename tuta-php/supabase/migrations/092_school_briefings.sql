-- ─────────────────────────────────────────────────────────────────
-- Migration 092: AI School Briefing storage
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor, then Settings → API →
-- Reload Schema Cache.
--
-- Stores each generated "School Briefing" (the AI-prioritised action list)
-- so the last one shows instantly without re-calling the model. `facts` is
-- the verified numbers we computed and sent; `briefing` is the model's
-- categorised output — keeping both makes every claim auditable.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_briefings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by UUID,
    model        TEXT,
    facts        JSONB,       -- the verified numbers we fed the model
    briefing     JSONB,       -- the model's categorised sections
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_briefing_school ON school_briefings(school_id, generated_at DESC);

ALTER TABLE school_briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_school_briefings" ON school_briefings;
CREATE POLICY "srv_school_briefings" ON school_briefings FOR ALL USING (true) WITH CHECK (true);
