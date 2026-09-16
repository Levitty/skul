-- ─────────────────────────────────────────────────────────────────
-- Migration 062: Fix discount tables (resolves the HTTP 500 on save)
-- ─────────────────────────────────────────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- Why this is needed:
--   The PHP discounts module expects two tables:
--     1. fee_discounts        — the catalog (e.g. "10% Sibling Discount")
--     2. student_discounts    — assignments of a discount to a student,
--                               optionally scoped to a single fee head.
--
--   Two things can be wrong in an existing database:
--     a. fee_discounts was never created (migration 045 didn't run for the
--        PHP rewrite). INSERT fails → HTTP 500 "relation does not exist".
--     b. student_discounts exists in the OLD shape (migration 040): it has
--        NOT NULL columns like academic_year_id, discount_name,
--        discount_value, and no fee_discount_id. The new PHP code passes
--        only fee_discount_id + student_id + fee_head_id + status, which
--        violates NOT NULL → HTTP 500.
--
--   This migration:
--     1. Idempotently creates fee_discounts in the expected shape.
--     2. Detects old-shape student_discounts, backs it up to
--        student_discounts_legacy_040, and recreates the table in the
--        new shape. (Backup is non-destructive — your historical rows
--        are preserved and queryable.)
--
-- Safe to run multiple times. Old data is preserved in a backup table
-- (student_discounts_legacy_040) so nothing is silently lost.
-- ─────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 1. fee_discounts — the discount catalog
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fee_discounts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'percentage' CHECK (type IN ('percentage', 'fixed')),
    value       NUMERIC(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_discounts_school ON fee_discounts(school_id);

ALTER TABLE fee_discounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_fee_discounts" ON fee_discounts;
CREATE POLICY "srv_fee_discounts" ON fee_discounts FOR ALL USING (true);

-- ════════════════════════════════════════════════════════════════
-- 2. student_discounts — migrate old shape → new shape
-- ════════════════════════════════════════════════════════════════
-- Detect the old shape by looking for the discount_name column,
-- which exists in 040 but not in 045. If found: back up, drop, recreate.
DO $migrate$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'student_discounts'
           AND column_name  = 'discount_name'
    ) THEN
        -- Preserve historical rows in a backup table you can inspect later.
        -- The backup is one-shot: if it already exists from a previous run,
        -- leave it alone.
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name   = 'student_discounts_legacy_040'
        ) THEN
            EXECUTE 'CREATE TABLE student_discounts_legacy_040 AS TABLE student_discounts';
            RAISE NOTICE 'Old student_discounts rows backed up to student_discounts_legacy_040';
        END IF;

        -- CASCADE drops any foreign keys pointing at the old table.
        EXECUTE 'DROP TABLE student_discounts CASCADE';
        RAISE NOTICE 'Dropped legacy student_discounts (old 040 shape)';
    END IF;
END
$migrate$;

CREATE TABLE IF NOT EXISTS student_discounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_discount_id UUID NOT NULL REFERENCES fee_discounts(id) ON DELETE CASCADE,
    fee_head_id     UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'approved'
                    CHECK (status IN ('pending','approved','rejected','expired')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, fee_discount_id, fee_head_id)
);

CREATE INDEX IF NOT EXISTS idx_student_discounts_student  ON student_discounts(student_id);
CREATE INDEX IF NOT EXISTS idx_student_discounts_discount ON student_discounts(fee_discount_id);

ALTER TABLE student_discounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_student_discounts" ON student_discounts;
CREATE POLICY "srv_student_discounts" ON student_discounts FOR ALL USING (true);

-- ════════════════════════════════════════════════════════════════
-- Verification (run after the above):
--
--   SELECT to_regclass('public.fee_discounts');       -- 'fee_discounts'
--   SELECT to_regclass('public.student_discounts');   -- 'student_discounts'
--   SELECT column_name, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'student_discounts'
--    ORDER BY ordinal_position;
--   -- Expect: id, student_id, fee_discount_id, fee_head_id, status, created_at
-- ════════════════════════════════════════════════════════════════
