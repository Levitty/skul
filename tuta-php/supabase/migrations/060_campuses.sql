-- ════════════════════════════════════════════════════════════════
-- Migration 060: Campuses within a tenant
-- ════════════════════════════════════════════════════════════════
-- See docs/DESIGN_campuses.md for the full design.
--
-- What this does:
--   1. Adds branch_id to every table that's campus-scoped per the design.
--      ("branch" is the table name, "campus" is the UI label.)
--   2. Creates campus_mpesa_settings — one M-Pesa config per campus.
--   3. Adds indexes for fast branch-filtered queries.
--   4. BACKFILL: for every existing school, creates a "Main Campus" if it
--      doesn't have one, then assigns it to all existing campus-scoped rows
--      so the live app keeps working with zero visible change.
--
-- Safe to run on a database that already has migration 011 applied — every
-- ALTER uses IF NOT EXISTS / WHERE branch_id IS NULL so re-running is a no-op.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Add branch_id to campus-scoped tables ────────────────────
-- (students, classes, sections, employees, user_schools already have it
-- from migration 011. Listing here as a sanity check anyway.)
ALTER TABLE students         ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE classes          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE sections         ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE employees        ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;

-- New on this migration:
ALTER TABLE invoices         ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE payments         ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE income           ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE activities       ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE fee_heads        ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE fee_groups       ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;

-- Policy/setup tables — campus-scoped too:
ALTER TABLE fee_discounts    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE fee_penalties    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;


-- ── 2. Per-campus M-Pesa credentials ─────────────────────────────
-- Each campus has its own paybill or till. school_id is denormalised on
-- this table so RLS policies can scope by school without a join.
CREATE TABLE IF NOT EXISTS campus_mpesa_settings (
    branch_id        UUID PRIMARY KEY REFERENCES school_branches(id) ON DELETE CASCADE,
    school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,

    shortcode_type   TEXT CHECK (shortcode_type IN ('paybill','till')),
    shortcode        TEXT,        -- the paybill or till number
    consumer_key     TEXT,
    consumer_secret  TEXT,        -- store encrypted at app layer if possible
    passkey          TEXT,
    callback_url     TEXT,
    is_sandbox       BOOLEAN DEFAULT false,
    is_active        BOOLEAN DEFAULT true,

    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campus_mpesa_settings ENABLE ROW LEVEL SECURITY;

-- Service role (the PHP app) has full access:
DROP POLICY IF EXISTS "Service role full access" ON campus_mpesa_settings;
CREATE POLICY "Service role full access" ON campus_mpesa_settings
    FOR ALL USING (true) WITH CHECK (true);

-- Authenticated users see only their own school's M-Pesa rows.
-- (Branch-level enforcement is handled at the PHP/session layer.)
DROP POLICY IF EXISTS "Read own school mpesa" ON campus_mpesa_settings;
CREATE POLICY "Read own school mpesa" ON campus_mpesa_settings
    FOR SELECT TO authenticated
    USING (school_id IN (SELECT us.school_id FROM user_schools us WHERE us.user_id = auth.uid()));


-- ── 3. Indexes ───────────────────────────────────────────────────
-- Partial indexes (WHERE branch_id IS NOT NULL) keep them small until
-- the school actually adds multiple campuses.
CREATE INDEX IF NOT EXISTS idx_invoices_branch         ON invoices(branch_id)         WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_branch         ON payments(branch_id)         WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_branch         ON expenses(branch_id)         WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_income_branch           ON income(branch_id)           WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transport_routes_branch ON transport_routes(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_branch       ON activities(branch_id)       WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_heads_branch        ON fee_heads(branch_id)        WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_groups_branch       ON fee_groups(branch_id)       WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_discounts_branch    ON fee_discounts(branch_id)    WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_penalties_branch    ON fee_penalties(branch_id)    WHERE branch_id IS NOT NULL;


-- ── 4. Backfill: create "Main Campus" for any school that doesn't ──
-- ──    have one, then assign every existing row to it.            ──
-- Idempotent — safe to re-run.
DO $$
DECLARE
    s RECORD;
    main_id UUID;
BEGIN
    FOR s IN SELECT id FROM schools LOOP
        -- Pick this school's default campus.
        -- Prefer an existing active branch; otherwise create "Main Campus".
        SELECT id INTO main_id
        FROM school_branches
        WHERE school_id = s.id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF main_id IS NULL THEN
            INSERT INTO school_branches (school_id, name, is_active)
            VALUES (s.id, 'Main Campus', true)
            RETURNING id INTO main_id;
        END IF;

        -- Backfill every campus-scoped table for this school where branch_id is NULL.
        UPDATE students         SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE classes          SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE sections         SET branch_id = main_id
            WHERE branch_id IS NULL
            AND class_id IN (SELECT id FROM classes WHERE school_id = s.id);
        UPDATE employees        SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE invoices         SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE payments         SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE expenses         SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE income           SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE transport_routes SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE activities       SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE fee_heads        SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE fee_groups       SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE fee_discounts    SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
        UPDATE fee_penalties    SET branch_id = main_id WHERE school_id = s.id AND branch_id IS NULL;
    END LOOP;
END $$;


-- ── 5. updated_at trigger for campus_mpesa_settings ──────────────
CREATE OR REPLACE FUNCTION update_campus_mpesa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campus_mpesa_updated_at ON campus_mpesa_settings;
CREATE TRIGGER trg_campus_mpesa_updated_at
    BEFORE UPDATE ON campus_mpesa_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_campus_mpesa_updated_at();


-- ════════════════════════════════════════════════════════════════
-- Verification queries (RUN THESE MANUALLY after applying)
-- ════════════════════════════════════════════════════════════════
-- 1. Every school has at least one campus:
--    SELECT s.name, COUNT(b.id) AS campuses
--    FROM schools s LEFT JOIN school_branches b ON b.school_id = s.id
--    GROUP BY s.id, s.name;
--
-- 2. No campus-scoped row is stranded (branch_id IS NULL after backfill):
--    SELECT 'students'  AS tbl, COUNT(*) FROM students  WHERE branch_id IS NULL
--    UNION ALL SELECT 'classes',   COUNT(*) FROM classes   WHERE branch_id IS NULL
--    UNION ALL SELECT 'invoices',  COUNT(*) FROM invoices  WHERE branch_id IS NULL
--    UNION ALL SELECT 'payments',  COUNT(*) FROM payments  WHERE branch_id IS NULL
--    UNION ALL SELECT 'fee_heads', COUNT(*) FROM fee_heads WHERE branch_id IS NULL
--    UNION ALL SELECT 'fee_groups',COUNT(*) FROM fee_groups WHERE branch_id IS NULL;
--    -- All counts should be 0.
--
-- 3. Crown of Gold has its Main Campus:
--    SELECT name FROM school_branches WHERE school_id = (SELECT id FROM schools WHERE slug = 'cogs');
-- ════════════════════════════════════════════════════════════════
