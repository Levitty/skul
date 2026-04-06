-- ============================================================================
-- 024: Report Cards + Teacher Performance
-- ============================================================================

-- Report cards: one per student per term
CREATE TABLE IF NOT EXISTS report_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  term_id UUID NOT NULL REFERENCES terms(id),

  overall_percentage NUMERIC(5,2),
  overall_grade TEXT,
  class_rank INTEGER,
  class_size INTEGER,

  attendance_present INTEGER DEFAULT 0,
  attendance_total INTEGER DEFAULT 0,
  attendance_percentage NUMERIC(5,2),

  teacher_remarks TEXT,
  principal_remarks TEXT,

  pdf_url TEXT,  -- Supabase Storage path
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'sent')),

  generated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (student_id, academic_year_id, term_id)
);

-- Subject-level marks for each report card
CREATE TABLE IF NOT EXISTS report_card_subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_card_id UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  subject_id UUID REFERENCES subjects(id),
  teacher_id UUID REFERENCES employees(id),

  marks_obtained NUMERIC(6,2),
  max_marks NUMERIC(6,2),
  percentage NUMERIC(5,2),
  grade TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_cards_school ON report_cards(school_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_student ON report_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_class_term ON report_cards(class_id, term_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_status ON report_cards(status);
CREATE INDEX IF NOT EXISTS idx_report_card_subjects_card ON report_card_subjects(report_card_id);

-- RLS
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_cards_school_access" ON report_cards
  FOR ALL USING (
    school_id IN (
      SELECT school_id FROM user_schools WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "report_card_subjects_access" ON report_card_subjects
  FOR ALL USING (
    report_card_id IN (
      SELECT id FROM report_cards WHERE school_id IN (
        SELECT school_id FROM user_schools WHERE user_id = auth.uid()
      )
    )
  );

-- Supabase Storage bucket for report card PDFs
-- (Run this manually in Supabase dashboard if storage isn't available in migrations)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('report-cards', 'report-cards', false);
