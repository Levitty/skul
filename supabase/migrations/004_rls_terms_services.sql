-- RLS Policies for Terms, Student Services, Activities, and School Settings
-- This extends the existing RLS policies in 002_rls_policies.sql

-- Enable RLS on new tables
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;

-- Terms policies
CREATE POLICY "Users can access terms of their school"
  ON terms FOR ALL
  USING (school_id = get_user_school_id());

-- Student Services policies
CREATE POLICY "Users can access student services of their school"
  ON student_services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_services.student_id
      AND s.school_id = get_user_school_id()
    )
  );

-- Activities policies
CREATE POLICY "Users can access activities of their school"
  ON activities FOR ALL
  USING (school_id = get_user_school_id());

-- Student Activities policies
CREATE POLICY "Users can access student activities of their school"
  ON student_activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_activities.student_id
      AND s.school_id = get_user_school_id()
    )
  );

-- School Settings policies
CREATE POLICY "Users can view school settings of their school"
  ON school_settings FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage school settings of their school"
  ON school_settings FOR ALL
  USING (
    school_id = get_user_school_id()
    AND EXISTS (
      SELECT 1 FROM user_schools
      WHERE user_id = auth.uid()
      AND school_id = get_user_school_id()
      AND role IN ('school_admin', 'super_admin')
    )
  );

-- Update payments RLS to include school_id filter (if school_id column exists)
-- Note: This assumes payments.school_id was added in migration 003
DO $$
BEGIN
  -- Drop existing payments policy if it exists
  DROP POLICY IF EXISTS "Users can access payments of their school" ON payments;
  
  -- Create new policy that uses school_id directly
  CREATE POLICY "Users can access payments of their school"
    ON payments FOR ALL
    USING (
      school_id = get_user_school_id()
      OR EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.id = payments.invoice_id
        AND i.school_id = get_user_school_id()
      )
    );
EXCEPTION
  WHEN undefined_column THEN
    -- If school_id doesn't exist yet, fall back to invoice-based policy
    CREATE POLICY "Users can access payments of their school"
      ON payments FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM invoices i
          WHERE i.id = payments.invoice_id
          AND i.school_id = get_user_school_id()
        )
      );
END $$;




