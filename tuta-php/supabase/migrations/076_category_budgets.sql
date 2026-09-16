-- ─────────────────────────────────────────────────────────────────
-- Migration 076: Expense category budgets (for budget-vs-actual)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- Backs the Finance Overview report's budgeting section. One budget per
-- expense category per academic year. The page upserts on
-- (school_id, expense_category_id, academic_year_id).
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS category_budgets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    expense_category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    academic_year_id    UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, expense_category_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_school ON category_budgets(school_id);
CREATE INDEX IF NOT EXISTS idx_category_budgets_year   ON category_budgets(academic_year_id);

ALTER TABLE category_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_category_budgets" ON category_budgets;
CREATE POLICY "srv_category_budgets" ON category_budgets FOR ALL USING (true);
