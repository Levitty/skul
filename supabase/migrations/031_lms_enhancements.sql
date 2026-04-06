-- =============================================
-- 031: LMS Enhancements — Assignments & Quizzes
-- =============================================

-- Assignments (teacher-created)
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES employees(id),
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    due_date TIMESTAMPTZ,
    max_score NUMERIC(6, 2) DEFAULT 100,
    allow_late_submission BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_school ON assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);

-- Assignment submissions (student responses)
CREATE TABLE IF NOT EXISTS assignment_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    submission_text TEXT,
    file_url TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    score NUMERIC(6, 2),
    feedback TEXT,
    graded_at TIMESTAMPTZ,
    graded_by UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'returned', 'late')),
    UNIQUE(assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);

-- Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES employees(id),
    title TEXT NOT NULL,
    description TEXT,
    time_limit_minutes INT,
    max_attempts INT DEFAULT 1,
    passing_score NUMERIC(6, 2) DEFAULT 50,
    is_published BOOLEAN DEFAULT false,
    shuffle_questions BOOLEAN DEFAULT false,
    show_answers_after BOOLEAN DEFAULT true,
    available_from TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_school ON quizzes(school_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_class ON quizzes(class_id);

-- Quiz questions
CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
    points NUMERIC(6, 2) DEFAULT 1,
    order_index INT DEFAULT 0,
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);

-- Quiz answer options (for multiple choice)
CREATE TABLE IF NOT EXISTS quiz_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false,
    order_index INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON quiz_options(question_id);

-- Quiz attempts (student responses)
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    score NUMERIC(6, 2),
    total_points NUMERIC(6, 2),
    percentage NUMERIC(5, 2),
    passed BOOLEAN,
    attempt_number INT DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts(student_id);

-- Student answers for each attempt
CREATE TABLE IF NOT EXISTS quiz_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES quiz_options(id),
    answer_text TEXT,
    is_correct BOOLEAN,
    points_earned NUMERIC(6, 2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt ON quiz_answers(attempt_id);

-- RLS
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_school_access" ON assignments
    FOR ALL USING (school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()));

CREATE POLICY "submissions_access" ON assignment_submissions
    FOR ALL USING (assignment_id IN (SELECT id FROM assignments WHERE school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())));

CREATE POLICY "quizzes_school_access" ON quizzes
    FOR ALL USING (school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()));

CREATE POLICY "quiz_questions_access" ON quiz_questions
    FOR ALL USING (quiz_id IN (SELECT id FROM quizzes WHERE school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())));

CREATE POLICY "quiz_options_access" ON quiz_options
    FOR ALL USING (question_id IN (SELECT id FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()))));

CREATE POLICY "quiz_attempts_access" ON quiz_attempts
    FOR ALL USING (quiz_id IN (SELECT id FROM quizzes WHERE school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())));

CREATE POLICY "quiz_answers_access" ON quiz_answers
    FOR ALL USING (attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()))));
