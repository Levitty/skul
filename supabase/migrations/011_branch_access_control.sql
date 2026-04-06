-- =====================================================
-- Branch-Based Access Control Migration
-- =====================================================
-- This migration adds branch-level access control to the system.
-- School admins can see all branches, while branch_admin and 
-- branch-scoped users can only see their assigned branch's data.
-- =====================================================

-- =====================================================
-- 1. Add branch_id to user_schools table
-- =====================================================
-- NULL branch_id means user has access to all branches (for school_admin)
ALTER TABLE user_schools 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;

-- =====================================================
-- 2. Update role check constraint to include branch_admin
-- =====================================================
-- First drop the existing constraint
ALTER TABLE user_schools DROP CONSTRAINT IF EXISTS user_schools_role_check;

-- Add new constraint with branch_admin role
ALTER TABLE user_schools ADD CONSTRAINT user_schools_role_check 
  CHECK (role IN (
    'super_admin', 
    'school_admin', 
    'branch_admin',  -- NEW: Full access to a specific branch
    'teacher', 
    'parent', 
    'student', 
    'accountant', 
    'librarian', 
    'nurse', 
    'transport_manager', 
    'hostel_manager'
  ));

-- =====================================================
-- 3. Add branch_id to data tables
-- =====================================================

-- Students: Each student belongs to a branch
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;

-- Classes: Each class belongs to a branch
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;

-- Sections: Inherit branch from class, but can also have direct reference
ALTER TABLE sections 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;

-- Employees: Staff can be assigned to branches
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL;

-- =====================================================
-- 4. Create indexes for branch_id columns
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_user_schools_branch_id ON user_schools(branch_id);
CREATE INDEX IF NOT EXISTS idx_students_branch_id ON students(branch_id);
CREATE INDEX IF NOT EXISTS idx_classes_branch_id ON classes(branch_id);
CREATE INDEX IF NOT EXISTS idx_sections_branch_id ON sections(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id);

-- =====================================================
-- 5. Create helper function to check branch access
-- =====================================================
CREATE OR REPLACE FUNCTION user_has_branch_access(target_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_branch_id UUID;
    user_role TEXT;
BEGIN
    -- Get user's branch and role from user_schools
    SELECT us.branch_id, us.role INTO user_branch_id, user_role
    FROM user_schools us
    WHERE us.user_id = auth.uid()
    LIMIT 1;
    
    -- Super admin and school admin have access to all branches
    IF user_role IN ('super_admin', 'school_admin') THEN
        RETURN TRUE;
    END IF;
    
    -- If user has no branch assigned (NULL), they can see all data
    IF user_branch_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- If target has no branch (NULL), it's accessible to all
    IF target_branch_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Check if user's branch matches target branch
    RETURN user_branch_id = target_branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. Create function to get user's branch ID
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS UUID AS $$
DECLARE
    result UUID;
BEGIN
    SELECT us.branch_id INTO result
    FROM user_schools us
    WHERE us.user_id = auth.uid()
    LIMIT 1;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 7. Create function to check if user has all-branches access
-- =====================================================
CREATE OR REPLACE FUNCTION user_has_all_branches_access()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    user_branch_id UUID;
BEGIN
    SELECT us.role, us.branch_id INTO user_role, user_branch_id
    FROM user_schools us
    WHERE us.user_id = auth.uid()
    LIMIT 1;
    
    -- Super admin and school admin always have all branches access
    IF user_role IN ('super_admin', 'school_admin') THEN
        RETURN TRUE;
    END IF;
    
    -- Users with NULL branch_id have all branches access
    IF user_branch_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. Update RLS policies for students table
-- =====================================================
-- Drop existing student policies if they exist
DROP POLICY IF EXISTS "Users can view students in their school" ON students;
DROP POLICY IF EXISTS "Admins can manage students in their school" ON students;

-- Create new branch-aware policies
CREATE POLICY "Users can view students in their school and branch"
  ON students FOR SELECT
  USING (
    school_id = get_user_school_id()
    AND user_has_branch_access(branch_id)
  );

CREATE POLICY "Admins can insert students in their school and branch"
  ON students FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id()
    AND (
      user_has_all_branches_access()
      OR branch_id = get_user_branch_id()
      OR branch_id IS NULL
    )
  );

CREATE POLICY "Admins can update students in their school and branch"
  ON students FOR UPDATE
  USING (
    school_id = get_user_school_id()
    AND user_has_branch_access(branch_id)
  )
  WITH CHECK (
    school_id = get_user_school_id()
    AND user_has_branch_access(branch_id)
  );

CREATE POLICY "Admins can delete students in their school and branch"
  ON students FOR DELETE
  USING (
    school_id = get_user_school_id()
    AND user_has_branch_access(branch_id)
    AND EXISTS (
      SELECT 1 FROM user_schools 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'school_admin', 'branch_admin')
    )
  );

-- =====================================================
-- 9. Update RLS policies for classes table
-- =====================================================
DROP POLICY IF EXISTS "Users can view classes in their school" ON classes;
DROP POLICY IF EXISTS "Admins can manage classes in their school" ON classes;

CREATE POLICY "Users can view classes in their school and branch"
  ON classes FOR SELECT
  USING (
    school_id = get_user_school_id()
    AND user_has_branch_access(branch_id)
  );

CREATE POLICY "Admins can insert classes in their school and branch"
  ON classes FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id()
    AND (
      user_has_all_branches_access()
      OR branch_id = get_user_branch_id()
      OR branch_id IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM user_schools 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'school_admin', 'branch_admin')
    )
  );

CREATE POLICY "Admins can update classes in their school and branch"
  ON classes FOR UPDATE
  USING (
    school_id = get_user_school_id()
    AND user_has_branch_access(branch_id)
    AND EXISTS (
      SELECT 1 FROM user_schools 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'school_admin', 'branch_admin')
    )
  );

CREATE POLICY "Admins can delete classes in their school and branch"
  ON classes FOR DELETE
  USING (
    school_id = get_user_school_id()
    AND user_has_branch_access(branch_id)
    AND EXISTS (
      SELECT 1 FROM user_schools 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'school_admin', 'branch_admin')
    )
  );

-- =====================================================
-- 10. Update RLS policies for sections table
-- =====================================================
DROP POLICY IF EXISTS "Users can view sections in their school" ON sections;
DROP POLICY IF EXISTS "Admins can manage sections" ON sections;

CREATE POLICY "Users can view sections in their school and branch"
  ON sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = sections.class_id
      AND c.school_id = get_user_school_id()
      AND user_has_branch_access(c.branch_id)
    )
  );

CREATE POLICY "Admins can insert sections"
  ON sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id
      AND c.school_id = get_user_school_id()
      AND (user_has_all_branches_access() OR c.branch_id = get_user_branch_id() OR c.branch_id IS NULL)
    )
    AND EXISTS (
      SELECT 1 FROM user_schools 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'school_admin', 'branch_admin')
    )
  );

CREATE POLICY "Admins can update sections"
  ON sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = sections.class_id
      AND c.school_id = get_user_school_id()
      AND user_has_branch_access(c.branch_id)
    )
    AND EXISTS (
      SELECT 1 FROM user_schools 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'school_admin', 'branch_admin')
    )
  );

CREATE POLICY "Admins can delete sections"
  ON sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = sections.class_id
      AND c.school_id = get_user_school_id()
      AND user_has_branch_access(c.branch_id)
    )
    AND EXISTS (
      SELECT 1 FROM user_schools 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'school_admin', 'branch_admin')
    )
  );

-- =====================================================
-- 11. Update invoices to filter by student's branch
-- =====================================================
DROP POLICY IF EXISTS "Users can view invoices in their school" ON invoices;

CREATE POLICY "Users can view invoices in their school and branch"
  ON invoices FOR SELECT
  USING (
    school_id = get_user_school_id()
    AND (
      user_has_all_branches_access()
      OR EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = invoices.student_id
        AND user_has_branch_access(s.branch_id)
      )
    )
  );

-- =====================================================
-- 12. Update payments to filter by invoice's student's branch
-- =====================================================
DROP POLICY IF EXISTS "Users can view payments in their school" ON payments;

CREATE POLICY "Users can view payments in their school and branch"
  ON payments FOR SELECT
  USING (
    school_id = get_user_school_id()
    AND (
      user_has_all_branches_access()
      OR EXISTS (
        SELECT 1 FROM invoices i
        JOIN students s ON s.id = i.student_id
        WHERE i.id = payments.invoice_id
        AND user_has_branch_access(s.branch_id)
      )
    )
  );

-- =====================================================
-- 13. Update attendance_records to filter by student's branch
-- =====================================================
DROP POLICY IF EXISTS "Users can view attendance in their school" ON attendance_records;

CREATE POLICY "Users can view attendance in their school and branch"
  ON attendance_records FOR SELECT
  USING (
    school_id = get_user_school_id()
    AND (
      user_has_all_branches_access()
      OR EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = attendance_records.student_id
        AND user_has_branch_access(s.branch_id)
      )
    )
  );

-- =====================================================
-- 14. Grant execute permissions on new functions
-- =====================================================
GRANT EXECUTE ON FUNCTION user_has_branch_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_all_branches_access() TO authenticated;


