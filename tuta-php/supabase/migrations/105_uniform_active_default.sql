-- ─────────────────────────────────────────────────────────────────
-- Migration 105: uniform items default to sellable
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- BUG: adding a uniform product left is_active NULL, and the till only lists
-- is_active items — so newly added uniforms never appeared for sale ("even when
-- you add uniforms it doesn't show all the uniforms available"). The PHP now
-- sets is_active = true on add; this backfills items already stuck at NULL and
-- makes the column default true so no code path can reintroduce the gap.
--
-- Only NULLs are touched — items deliberately hidden via the till toggle
-- (is_active = false) are left as-is.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE uniform_products ALTER COLUMN is_active SET DEFAULT true;

UPDATE uniform_products
   SET is_active = true
 WHERE is_active IS NULL;
