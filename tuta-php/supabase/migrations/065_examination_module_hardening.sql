-- ============================================================================
-- 065: Examination module — schema + hardening
--
-- A schema diagnostic on 2026-05-24 showed migrations 024 and 044 were never
-- applied to this database:
--   • exams was missing term_id / start_date / end_date / max_marks / status
--   • grades, report_cards and report_card_subjects did not exist at all
--
-- That means exam creation AND grade entry were both broken. This migration
-- creates everything the examination module needs and applies Row-Level
-- Security to the new tables.
--
-- Every statement is idempotent — safe to run more than once.
-- Run this whole file once in the Supabase SQL editor.
-- ============================================================================


-- ── 1. exams: add the columns the app uses ──────────────────────────────────
-- The PHP exam form writes term_id, start_date, end_date, max_marks and
-- status. academic_year_id already exists.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS term_id    UUID REFERENCES terms(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_date   DATE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_marks  NUMERIC(6,2) DEFAULT 100;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT 'upcoming';

-- exam_type is NOT NULL with no default, but the exam form does not send it.
-- Give it a default so creating an exam succeeds.
ALTER TABLE exams ALTER COLUMN exam_type SET DEFAULT 'continuous_assessment';


-- ── 2. grades: direct exam + subject + student marks ────────────────────────
CREATE TABLE IF NOT EXISTS grades (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
    exam_id     UUID NOT NULL REFERENCES exams(id)    ON DELETE CASCADE,
    subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id    UUID REFERENCES classes(id),
    marks       NUMERIC(6,2),
    grade       TEXT,
    remarks     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (exam_id, subject_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_grades_exam    ON grades(exam_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_class   ON grades(class_id);

-- RLS: a row is visible only to users of its school.
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grades_school_access" ON grades;
CREATE POLICY "grades_school_access" ON grades
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_schools WHERE user_id = auth.uid()
    )
  );


-- ── 3. report_cards: one saved report card per student per exam ─────────────
CREATE TABLE IF NOT EXISTS report_cards (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id             UUID NOT NULL REFERENCES schools(id)        ON DELETE CASCADE,
    student_id            UUID NOT NULL REFERENCES students(id)       ON DELETE CASCADE,
    class_id              UUID NOT NULL REFERENCES classes(id),
    academic_year_id      UUID NOT NULL REFERENCES academic_years(id),
    term_id               UUID REFERENCES terms(id),
    exam_id               UUID REFERENCES exams(id) ON DELETE CASCADE,

    overall_percentage    NUMERIC(5,2),
    overall_grade         TEXT,
    class_rank            INTEGER,
    class_size            INTEGER,

    attendance_present    INTEGER DEFAULT 0,
    attendance_total      INTEGER DEFAULT 0,
    attendance_percentage NUMERIC(5,2),

    teacher_remarks       TEXT,
    principal_remarks     TEXT,

    pdf_url               TEXT,
    status                TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'sent')),

    generated_at          TIMESTAMPTZ DEFAULT NOW(),
    published_at          TIMESTAMPTZ,
    sent_at               TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- One report card per student per exam. This is also the conflict target the
-- app upserts against when generating cards.
CREATE UNIQUE INDEX IF NOT EXISTS report_cards_student_exam_key
    ON report_cards (student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_school     ON report_cards(school_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_exam       ON report_cards(exam_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_class_term ON report_cards(class_id, term_id);

ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_cards_school_access" ON report_cards;
CREATE POLICY "report_cards_school_access" ON report_cards
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_schools WHERE user_id = auth.uid()
    )
  );


-- ── 4. report_card_subjects: the subject lines on each report card ──────────
-- teacher_id is a plain UUID (no FK) — the app does not populate it yet and
-- this avoids depending on an employees table that may not exist.
CREATE TABLE IF NOT EXISTS report_card_subjects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_card_id  UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
    subject_name    TEXT NOT NULL,
    subject_id      UUID REFERENCES subjects(id),
    teacher_id      UUID,
    marks_obtained  NUMERIC(6,2),
    max_marks       NUMERIC(6,2),
    percentage      NUMERIC(5,2),
    grade           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_card_subjects_card
    ON report_card_subjects(report_card_id);

ALTER TABLE report_card_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_card_subjects_access" ON report_card_subjects;
CREATE POLICY "report_card_subjects_access" ON report_card_subjects
  FOR ALL USING (
    report_card_id IN (
      SELECT id FROM report_cards WHERE school_id IN (
        SELECT school_id FROM user_schools WHERE user_id = auth.uid()
      )
    )
  );
