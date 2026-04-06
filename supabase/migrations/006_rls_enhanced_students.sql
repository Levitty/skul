-- RLS Policies for Enhanced Students Module

-- Enable RLS on new tables
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_suspensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostels ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_subjects ENABLE ROW LEVEL SECURITY;

-- Emergency Contacts policies
CREATE POLICY "Users can access emergency contacts of students in their school"
  ON emergency_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = emergency_contacts.student_id
      AND s.school_id = get_user_school_id()
    )
  );

-- Student Suspensions policies
CREATE POLICY "Users can access suspensions of students in their school"
  ON student_suspensions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_suspensions.student_id
      AND s.school_id = get_user_school_id()
    )
  );

CREATE POLICY "Admins can create suspensions"
  ON student_suspensions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_suspensions.student_id
      AND s.school_id = get_user_school_id()
    )
    AND user_has_role('school_admin')
  );

CREATE POLICY "Admins can update suspensions"
  ON student_suspensions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_suspensions.student_id
      AND s.school_id = get_user_school_id()
    )
    AND user_has_role('school_admin')
  );

-- Student Transfers policies
CREATE POLICY "Users can access transfers of students in their school"
  ON student_transfers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_transfers.student_id
      AND s.school_id = get_user_school_id()
    )
    OR student_transfers.from_school_id = get_user_school_id()
    OR student_transfers.to_school_id = get_user_school_id()
  );

CREATE POLICY "Admins can create transfers"
  ON student_transfers FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = student_transfers.student_id
        AND s.school_id = get_user_school_id()
      )
      OR student_transfers.from_school_id = get_user_school_id()
      OR student_transfers.to_school_id = get_user_school_id()
    )
    AND user_has_role('school_admin')
  );

-- Inquiries policies
CREATE POLICY "Users can access inquiries of their school"
  ON inquiries FOR ALL
  USING (school_id = get_user_school_id());

-- School Branches policies
CREATE POLICY "Users can access branches of their school"
  ON school_branches FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage branches"
  ON school_branches FOR ALL
  USING (
    school_id = get_user_school_id()
    AND user_has_role('school_admin')
  );

-- Hostels policies
CREATE POLICY "Users can access hostels of their school"
  ON hostels FOR ALL
  USING (school_id = get_user_school_id());

-- Transport Routes policies
CREATE POLICY "Users can access transport routes of their school"
  ON transport_routes FOR ALL
  USING (school_id = get_user_school_id());

-- Subjects policies
CREATE POLICY "Users can access subjects of their school"
  ON subjects FOR ALL
  USING (school_id = get_user_school_id());

-- Class Subjects policies
CREATE POLICY "Users can access class subjects of their school"
  ON class_subjects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_subjects.class_id
      AND c.school_id = get_user_school_id()
    )
  );

-- Student Subjects policies
CREATE POLICY "Users can access student subjects of their school"
  ON student_subjects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_subjects.student_id
      AND s.school_id = get_user_school_id()
    )
  );



