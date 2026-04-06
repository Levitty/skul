-- Enable Row Level Security on all tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_profitability ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_anomalies ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's school_id
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS UUID AS $$
  SELECT school_id FROM user_schools WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to check if user has role
CREATE OR REPLACE FUNCTION user_has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_schools 
    WHERE user_id = auth.uid() 
    AND role = required_role
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Schools policies
CREATE POLICY "Users can view their school"
  ON schools FOR SELECT
  USING (id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can manage all schools"
  ON schools FOR ALL
  USING (user_has_role('super_admin'));

-- Academic Years policies
CREATE POLICY "Users can access academic years of their school"
  ON academic_years FOR ALL
  USING (school_id = get_user_school_id());

-- Classes policies
CREATE POLICY "Users can access classes of their school"
  ON classes FOR ALL
  USING (school_id = get_user_school_id());

-- Sections policies
CREATE POLICY "Users can access sections of their school"
  ON sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = sections.class_id
      AND c.school_id = get_user_school_id()
    )
  );

-- Students policies
CREATE POLICY "Users can access students of their school"
  ON students FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins and teachers can manage students"
  ON students FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('teacher'))
  );

CREATE POLICY "Admins can update students"
  ON students FOR UPDATE
  USING (
    school_id = get_user_school_id() 
    AND user_has_role('school_admin')
  );

-- Guardians policies
CREATE POLICY "Users can access guardians of students in their school"
  ON guardians FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = guardians.student_id
      AND s.school_id = get_user_school_id()
    )
  );

-- Applications policies
CREATE POLICY "Users can access applications of their school"
  ON applications FOR ALL
  USING (school_id = get_user_school_id());

-- Enrollments policies
CREATE POLICY "Users can access enrollments of their school"
  ON enrollments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = enrollments.student_id
      AND s.school_id = get_user_school_id()
    )
  );

-- Student Documents policies
CREATE POLICY "Users can access documents of students in their school"
  ON student_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_documents.student_id
      AND s.school_id = get_user_school_id()
    )
  );

-- User Profiles policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- User Schools policies
CREATE POLICY "Users can view their school associations"
  ON user_schools FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role = 'super_admin'));

-- Employees policies
CREATE POLICY "Users can access employees of their school"
  ON employees FOR ALL
  USING (school_id = get_user_school_id());

-- Periods policies
CREATE POLICY "Users can access periods of their school"
  ON periods FOR ALL
  USING (school_id = get_user_school_id());

-- Rooms policies
CREATE POLICY "Users can access rooms of their school"
  ON rooms FOR ALL
  USING (school_id = get_user_school_id());

-- Timetables policies
CREATE POLICY "Users can access timetables of their school"
  ON timetables FOR ALL
  USING (school_id = get_user_school_id());

-- Timetable Entries policies
CREATE POLICY "Users can access timetable entries of their school"
  ON timetable_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM timetables t
      WHERE t.id = timetable_entries.timetable_id
      AND t.school_id = get_user_school_id()
    )
  );

-- Attendance Records policies
CREATE POLICY "Users can access attendance of their school"
  ON attendance_records FOR ALL
  USING (school_id = get_user_school_id());

-- Fee Structures policies
CREATE POLICY "Users can access fee structures of their school"
  ON fee_structures FOR ALL
  USING (school_id = get_user_school_id());

-- Invoices policies
CREATE POLICY "Users can access invoices of their school"
  ON invoices FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Parents can view invoices of their children"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN guardians g ON g.student_id = s.id
      JOIN user_schools us ON us.user_id = auth.uid()
      WHERE s.id = invoices.student_id
      AND s.school_id = get_user_school_id()
      AND g.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Accountants and admins can manage invoices"
  ON invoices FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('accountant') OR user_has_role('school_admin'))
  );

-- Invoice Items policies
CREATE POLICY "Users can access invoice items"
  ON invoice_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id
      AND i.school_id = get_user_school_id()
    )
  );

-- Payments policies
CREATE POLICY "Users can access payments of their school"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
      AND i.school_id = get_user_school_id()
    )
  );

CREATE POLICY "Parents can view payments for their children's invoices"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN students s ON s.id = i.student_id
      JOIN guardians g ON g.student_id = s.id
      WHERE i.id = payments.invoice_id
      AND g.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Accountants and admins can manage payments"
  ON payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
      AND i.school_id = get_user_school_id()
      AND (user_has_role('accountant') OR user_has_role('school_admin'))
    )
  );

-- Payment Gateways policies
CREATE POLICY "Admins can manage payment gateways"
  ON payment_gateways FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant'))
  );

-- Payment Reconciliations policies
CREATE POLICY "Accountants can manage reconciliations"
  ON payment_reconciliations FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND user_has_role('accountant')
  );

-- Exams policies
CREATE POLICY "Users can access exams of their school"
  ON exams FOR ALL
  USING (school_id = get_user_school_id());

-- Exam Sessions policies
CREATE POLICY "Users can access exam sessions"
  ON exam_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_sessions.exam_id
      AND e.school_id = get_user_school_id()
    )
  );

-- Exam Results policies
CREATE POLICY "Teachers and admins can manage exam results"
  ON exam_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM exam_sessions es
      JOIN exams e ON e.id = es.exam_id
      WHERE es.id = exam_results.exam_session_id
      AND e.school_id = get_user_school_id()
      AND (user_has_role('teacher') OR user_has_role('school_admin'))
    )
  );

CREATE POLICY "Parents can view results of their children"
  ON exam_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN guardians g ON g.student_id = s.id
      WHERE s.id = exam_results.student_id
      AND g.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Grade Scales policies
CREATE POLICY "Users can access grade scales of their school"
  ON grade_scales FOR ALL
  USING (school_id = get_user_school_id());

-- Messages policies
CREATE POLICY "Users can access messages of their school"
  ON messages FOR ALL
  USING (school_id = get_user_school_id());

-- Message Templates policies
CREATE POLICY "Admins can manage message templates"
  ON message_templates FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('teacher'))
  );

-- WhatsApp Sessions policies
CREATE POLICY "Users can access their own magic link sessions"
  ON whatsapp_sessions FOR SELECT
  USING (
    school_id = get_user_school_id() 
    AND (user_id = auth.uid() OR phone_number = (SELECT phone FROM user_profiles WHERE id = auth.uid()))
  );

CREATE POLICY "System can create magic link sessions"
  ON whatsapp_sessions FOR INSERT
  WITH CHECK (school_id = get_user_school_id());

-- Notification Logs policies
CREATE POLICY "Admins can view notification logs"
  ON notification_logs FOR SELECT
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );

-- Strategic Layer policies

-- Financial Forecasts policies
CREATE POLICY "Admins can access financial forecasts"
  ON financial_forecasts FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant') OR user_has_role('super_admin'))
  );

-- Unit Profitability policies
CREATE POLICY "Admins can access unit profitability"
  ON unit_profitability FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant') OR user_has_role('super_admin'))
  );

-- Staff Metrics policies
CREATE POLICY "Admins can access staff metrics"
  ON staff_metrics FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );

CREATE POLICY "Teachers can view their own metrics"
  ON staff_metrics FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM employees 
      WHERE user_id = auth.uid() 
      AND school_id = get_user_school_id()
    )
  );

-- Audit Anomalies policies
CREATE POLICY "Admins can access audit anomalies"
  ON audit_anomalies FOR ALL
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant') OR user_has_role('super_admin'))
  );

