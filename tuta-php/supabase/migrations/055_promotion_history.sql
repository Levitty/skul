-- Migration 055: Create promotion_history table
-- Tracks yearly student promotions/graduations with full audit trail.
-- Run in Supabase Dashboard → SQL Editor
-- After running: Settings → API → Reload Schema Cache

CREATE TABLE IF NOT EXISTS promotion_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_class_id   UUID REFERENCES classes(id) ON DELETE SET NULL,
    to_class_id     UUID REFERENCES classes(id) ON DELETE SET NULL,
    from_year_id    UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    to_year_id      UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    promotion_type  TEXT NOT NULL DEFAULT 'promoted'
                    CHECK (promotion_type IN ('promoted', 'graduated', 'repeated', 'transferred')),
    notes           TEXT,
    promoted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_history_school
    ON promotion_history (school_id, from_year_id, to_year_id);

CREATE INDEX IF NOT EXISTS idx_promotion_history_student
    ON promotion_history (student_id, promoted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_history_unique
    ON promotion_history (school_id, student_id, from_year_id, to_year_id)
    WHERE promotion_type IN ('promoted', 'graduated');
