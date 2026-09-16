-- ─────────────────────────────────────────────────────────────────
-- Migration 087: Rate-limit event store
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor, then Reload Schema Cache. Idempotent.
--
-- A generic append-only event log used for throttling: failed logins (by
-- email and by IP) and public-form submissions (by IP). The PHP app counts
-- events for a `bucket` within a time window and blocks once a threshold is
-- exceeded. Service-role only (the app bypasses RLS; anon gets nothing).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket     TEXT NOT NULL,                       -- e.g. 'loginfail:ip:1.2.3.4'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_time
    ON rate_limit_events (bucket, created_at DESC);

ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_rate_limit_events" ON rate_limit_events;
CREATE POLICY "srv_rate_limit_events" ON rate_limit_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Optional housekeeping: prune events older than a day. Run manually, or set
-- up a Supabase scheduled job (pg_cron) if you have it enabled:
--   DELETE FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '1 day';
