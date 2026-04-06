-- =============================================
-- 027: Schemes of Work & Lesson Planning
-- =============================================

-- Schemes of work (term-level planning per subject per class)
CREATE TABLE IF NOT EXISTS schemes_of_work (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES employees(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'revision_needed')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schemes_school ON schemes_of_work(school_id);
CREATE INDEX IF NOT EXISTS idx_schemes_teacher ON schemes_of_work(teacher_id);
CREATE INDEX IF NOT EXISTS idx_schemes_subject ON schemes_of_work(subject_id);
CREATE INDEX IF NOT EXISTS idx_schemes_term ON schemes_of_work(term_id);

-- Scheme entries (weekly breakdown within a scheme)
CREATE TABLE IF NOT EXISTS scheme_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID NOT NULL REFERENCES schemes_of_work(id) ON DELETE CASCADE,
    week_number INT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    objectives TEXT,
    teaching_activities TEXT,
    learning_resources TEXT,
    assessment TEXT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheme_entries_scheme ON scheme_entries(scheme_id);

-- Lesson plans (individual lesson within a scheme entry)
CREATE TABLE IF NOT EXISTS lesson_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    scheme_entry_id UUID REFERENCES scheme_entries(id) ON DELETE SET NULL,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES employees(id),
    title TEXT NOT NULL,
    lesson_date DATE,
    duration_minutes INT DEFAULT 40,
    -- Lesson structure
    strand TEXT,
    sub_strand TEXT,
    learning_indicators TEXT,
    -- Lesson flow
    introduction TEXT,
    lesson_development TEXT,
    conclusion TEXT,
    -- Resources and assessment
    teaching_aids TEXT,
    assessment_method TEXT,
    teacher_reflection TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'taught')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_plans_school ON lesson_plans(school_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_teacher ON lesson_plans(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_date ON lesson_plans(lesson_date);

-- RLS
ALTER TABLE schemes_of_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schemes_school_access" ON schemes_of_work
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "scheme_entries_access" ON scheme_entries
    FOR ALL USING (
        scheme_id IN (SELECT id FROM schemes_of_work WHERE school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()))
    );

CREATE POLICY "lesson_plans_school_access" ON lesson_plans
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );
