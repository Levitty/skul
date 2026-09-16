-- ============================================================================
-- 066: Configurable grading schemes  (Examination module — Phase 1)
--
-- Lets each school define its own grading scale instead of a hardcoded A–F.
-- A scheme is either marks-based (A/B/C…) or competency-based (EE/ME/AE/BE for
-- Kenya's CBC). Each scheme has bands that map a percentage range to a grade.
--
-- The starter schemes themselves are seeded by the app (it needs the school
-- id); this migration only creates the tables.
--
-- Every statement is idempotent. Run the whole file once in the Supabase
-- SQL editor.
-- ============================================================================


-- ── grading_schemes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_schemes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    scheme_type TEXT NOT NULL DEFAULT 'competency'
                    CHECK (scheme_type IN ('marks', 'competency')),
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grading_schemes_school ON grading_schemes(school_id);

ALTER TABLE grading_schemes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grading_schemes_school_access" ON grading_schemes;
CREATE POLICY "grading_schemes_school_access" ON grading_schemes
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_schools WHERE user_id = auth.uid()
    )
  );


-- ── grading_bands ───────────────────────────────────────────────────────────
-- Each band maps a percentage range to a grade. min_percent / max_percent are
-- 0–100 (independent of any exam's max marks). `code` is the short grade
-- ("EE", "A"); `label` is the full name ("Exceeding Expectations").
CREATE TABLE IF NOT EXISTS grading_bands (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    scheme_id   UUID NOT NULL REFERENCES grading_schemes(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    label       TEXT NOT NULL,
    min_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    max_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
    points      INTEGER,
    color       TEXT,
    remark      TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grading_bands_scheme ON grading_bands(scheme_id);
CREATE INDEX IF NOT EXISTS idx_grading_bands_school ON grading_bands(school_id);

ALTER TABLE grading_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grading_bands_school_access" ON grading_bands;
CREATE POLICY "grading_bands_school_access" ON grading_bands
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_schools WHERE user_id = auth.uid()
    )
  );
