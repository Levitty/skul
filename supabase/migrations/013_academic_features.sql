-- =====================================================
-- Academic Features Migration
-- =====================================================
-- Adds homework, study materials, announcements, events,
-- and student leaves management.
-- =====================================================

-- =====================================================
-- 1. Homework table
-- =====================================================
CREATE TABLE IF NOT EXISTS homework (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    teacher_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    due_date DATE NOT NULL,
    due_time TIME,
    attachments JSONB DEFAULT '[]',
    max_marks INTEGER,
    is_graded BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. Homework Submissions table
-- =====================================================
CREATE TABLE IF NOT EXISTS homework_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    homework_id UUID NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    submission_text TEXT,
    attachments JSONB DEFAULT '[]',
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    marks_obtained INTEGER,
    feedback TEXT,
    graded_at TIMESTAMPTZ,
    graded_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'late', 'graded', 'returned')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(homework_id, student_id)
);

-- =====================================================
-- 3. Study Materials table
-- =====================================================
CREATE TABLE IF NOT EXISTS study_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    uploaded_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    material_type TEXT DEFAULT 'document' CHECK (material_type IN ('document', 'video', 'audio', 'link', 'presentation', 'other')),
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    external_link TEXT,
    is_downloadable BOOLEAN DEFAULT true,
    is_visible BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. Announcements/Noticeboard table
-- =====================================================
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'teachers', 'parents', 'staff', 'specific_classes')),
    target_classes UUID[] DEFAULT '{}',
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    publish_date TIMESTAMPTZ DEFAULT NOW(),
    expiry_date TIMESTAMPTZ,
    attachments JSONB DEFAULT '[]',
    is_pinned BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. Events table
-- =====================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'general' CHECK (event_type IN ('general', 'holiday', 'exam', 'meeting', 'sports', 'cultural', 'academic', 'other')),
    start_date DATE NOT NULL,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    is_all_day BOOLEAN DEFAULT false,
    location TEXT,
    venue TEXT,
    organizer TEXT,
    target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'teachers', 'parents', 'staff', 'specific_classes')),
    target_classes UUID[] DEFAULT '{}',
    color TEXT DEFAULT '#3b82f6',
    attachments JSONB DEFAULT '[]',
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern JSONB,
    is_published BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. Student Leaves table
-- =====================================================
CREATE TABLE IF NOT EXISTS student_leaves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('sick', 'casual', 'family', 'medical', 'other')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
    reason TEXT NOT NULL,
    supporting_documents JSONB DEFAULT '[]',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    reviewer_remarks TEXT,
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 7. Create indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_homework_school_id ON homework(school_id);
CREATE INDEX IF NOT EXISTS idx_homework_class_id ON homework(class_id);
CREATE INDEX IF NOT EXISTS idx_homework_due_date ON homework(due_date);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework_id ON homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_student_id ON homework_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_school_id ON study_materials(school_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_class_id ON study_materials(class_id);
CREATE INDEX IF NOT EXISTS idx_announcements_school_id ON announcements(school_id);
CREATE INDEX IF NOT EXISTS idx_announcements_publish_date ON announcements(publish_date);
CREATE INDEX IF NOT EXISTS idx_events_school_id ON events(school_id);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_student_leaves_student_id ON student_leaves(student_id);
CREATE INDEX IF NOT EXISTS idx_student_leaves_status ON student_leaves(status);

-- =====================================================
-- 8. Enable RLS
-- =====================================================
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_leaves ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 9. RLS Policies for homework
-- =====================================================
CREATE POLICY "Users can view homework in their school"
  ON homework FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Teachers can manage homework"
  ON homework FOR ALL
  USING (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'teacher')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'teacher')));

-- =====================================================
-- 10. RLS Policies for homework_submissions
-- =====================================================
CREATE POLICY "Users can view submissions in their school"
  ON homework_submissions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM homework h 
    WHERE h.id = homework_submissions.homework_id 
    AND h.school_id = get_user_school_id()
  ));

CREATE POLICY "Students can submit homework"
  ON homework_submissions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM homework h 
    WHERE h.id = homework_id 
    AND h.school_id = get_user_school_id()
  ));

CREATE POLICY "Teachers can grade submissions"
  ON homework_submissions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM homework h 
    WHERE h.id = homework_submissions.homework_id 
    AND h.school_id = get_user_school_id()
  ) AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'teacher')));

-- =====================================================
-- 11. RLS Policies for study_materials
-- =====================================================
CREATE POLICY "Users can view study materials in their school"
  ON study_materials FOR SELECT
  USING (school_id = get_user_school_id() AND is_visible = true);

CREATE POLICY "Teachers can manage study materials"
  ON study_materials FOR ALL
  USING (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'teacher')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'teacher')));

-- =====================================================
-- 12. RLS Policies for announcements
-- =====================================================
CREATE POLICY "Users can view published announcements in their school"
  ON announcements FOR SELECT
  USING (school_id = get_user_school_id() AND is_published = true);

CREATE POLICY "Admins can manage announcements"
  ON announcements FOR ALL
  USING (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin')));

-- =====================================================
-- 13. RLS Policies for events
-- =====================================================
CREATE POLICY "Users can view published events in their school"
  ON events FOR SELECT
  USING (school_id = get_user_school_id() AND is_published = true);

CREATE POLICY "Admins can manage events"
  ON events FOR ALL
  USING (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin')));

-- =====================================================
-- 14. RLS Policies for student_leaves
-- =====================================================
CREATE POLICY "Users can view leaves in their school"
  ON student_leaves FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM students s 
    WHERE s.id = student_leaves.student_id 
    AND s.school_id = get_user_school_id()
  ));

CREATE POLICY "Parents can apply for leaves"
  ON student_leaves FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM students s 
    WHERE s.id = student_id 
    AND s.school_id = get_user_school_id()
  ));

CREATE POLICY "Admins can manage leaves"
  ON student_leaves FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM students s 
    WHERE s.id = student_leaves.student_id 
    AND s.school_id = get_user_school_id()
  ) AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'teacher')));

CREATE POLICY "Admins can delete leaves"
  ON student_leaves FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM students s 
    WHERE s.id = student_leaves.student_id 
    AND s.school_id = get_user_school_id()
  ) AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin')));

-- =====================================================
-- 15. Add RLS policies for subjects (if not exists)
-- =====================================================
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view subjects in their school" ON subjects;
DROP POLICY IF EXISTS "Admins can manage subjects" ON subjects;

CREATE POLICY "Users can view subjects in their school"
  ON subjects FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage subjects"
  ON subjects FOR ALL
  USING (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin')));


