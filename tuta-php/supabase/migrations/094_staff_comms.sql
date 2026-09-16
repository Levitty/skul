-- ─────────────────────────────────────────────────────────────────
-- Migration 094: Staff Room — internal staff communications
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor, then Settings → API →
-- Reload Schema Cache.
--
-- Design: channels are VIRTUAL — there is no channels table. A channel is a
-- derived key, and membership is computed from the graph at read time, so
-- groups can never rot (the WhatsApp failure this module replaces):
--   ann:{school_id}              announcements (admins/heads post, all staff read)
--   staff:{school_id}            staff room (all staff of the school)
--   dept:{group_id}:{slug}       department across ALL schools in a group
--   dept:{school_id}:{slug}      department within a school (no group)
-- {slug} = normalised subject name, so "Mathematics" at two branches lands
-- in ONE cross-branch channel — the curriculum-drift fix.
--
-- Messages may reference a work artifact (lesson plan / scheme of work /
-- exam), so discussion can attach to the actual document.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_key   TEXT NOT NULL,
    school_id     UUID NOT NULL,          -- poster's school (scoping + audit)
    user_id       UUID NOT NULL,
    user_name     TEXT NOT NULL DEFAULT '',
    body          TEXT NOT NULL,
    artifact_type TEXT,                   -- 'lesson_plan' | 'scheme_of_work' | 'exam' | NULL
    artifact_id   UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sm_channel ON staff_messages(channel_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sm_school  ON staff_messages(school_id);

CREATE TABLE IF NOT EXISTS staff_channel_reads (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    channel_key  TEXT NOT NULL,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, channel_key)
);

ALTER TABLE staff_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_channel_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_staff_messages" ON staff_messages;
CREATE POLICY "srv_staff_messages" ON staff_messages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "srv_staff_channel_reads" ON staff_channel_reads;
CREATE POLICY "srv_staff_channel_reads" ON staff_channel_reads FOR ALL USING (true) WITH CHECK (true);
