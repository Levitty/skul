-- =====================================================
-- COMPREHENSIVE RLS FIX - Run this in Supabase SQL Editor
-- =====================================================
-- This fixes the infinite recursion error and adds missing INSERT policies
-- Run this entire script in your Supabase SQL Editor

-- =====================================================
-- 1. Fix user_schools RLS policies (infinite recursion fix)
-- =====================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view their school associations" ON user_schools;

-- Recreate the SELECT policy using the helper function to avoid recursion
CREATE POLICY "Users can view their school associations"
  ON user_schools FOR SELECT
  USING (
    user_id = auth.uid() 
    OR user_has_role('super_admin')
  );

-- Add INSERT policy to allow users to create their own school associations
DROP POLICY IF EXISTS "Users can insert their own school associations" ON user_schools;
CREATE POLICY "Users can insert their own school associations"
  ON user_schools FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Add UPDATE policy to allow users to update their own school associations
DROP POLICY IF EXISTS "Users can update their own school associations" ON user_schools;
CREATE POLICY "Users can update their own school associations"
  ON user_schools FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow super_admins to manage all user_schools records
DROP POLICY IF EXISTS "Super admins can manage all school associations" ON user_schools;
CREATE POLICY "Super admins can manage all school associations"
  ON user_schools FOR ALL
  USING (user_has_role('super_admin'))
  WITH CHECK (user_has_role('super_admin'));

-- =====================================================
-- 2. Fix schools RLS policies (add INSERT and fix SELECT recursion)
-- =====================================================

-- Drop existing schools policies
DROP POLICY IF EXISTS "Users can view their school" ON schools;
DROP POLICY IF EXISTS "Super admins can manage all schools" ON schools;

-- Create a helper function that bypasses RLS to check school membership
CREATE OR REPLACE FUNCTION user_can_access_school(target_school_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_schools 
    WHERE user_id = auth.uid() 
    AND school_id = target_school_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Recreate SELECT policy using the helper function (avoids recursion)
CREATE POLICY "Users can view their school"
  ON schools FOR SELECT
  USING (user_can_access_school(id));

-- Allow authenticated users to create schools (for initial setup)
DROP POLICY IF EXISTS "Users can create schools" ON schools;
CREATE POLICY "Users can create schools"
  ON schools FOR INSERT
  WITH CHECK (true);

-- Allow school admins to update their own school
DROP POLICY IF EXISTS "School admins can update their school" ON schools;
CREATE POLICY "School admins can update their school"
  ON schools FOR UPDATE
  USING (user_can_access_school(id) AND user_has_role('school_admin'))
  WITH CHECK (user_can_access_school(id) AND user_has_role('school_admin'));

-- Super admins can manage all schools
DROP POLICY IF EXISTS "Super admins can manage all schools" ON schools;
CREATE POLICY "Super admins can manage all schools"
  ON schools FOR ALL
  USING (user_has_role('super_admin'))
  WITH CHECK (user_has_role('super_admin'));

-- =====================================================
-- 3. Fix fee_structures RLS policies (ensure INSERT works)
-- =====================================================

-- Drop existing fee_structures policies if they exist
DROP POLICY IF EXISTS "Users can access fee structures of their school" ON fee_structures;
DROP POLICY IF EXISTS "Admins can create fee structures" ON fee_structures;

-- Create comprehensive fee_structures policies
DROP POLICY IF EXISTS "Users can view fee structures of their school" ON fee_structures;
DROP POLICY IF EXISTS "Admins can create fee structures" ON fee_structures;
DROP POLICY IF EXISTS "Admins can update fee structures" ON fee_structures;
DROP POLICY IF EXISTS "Admins can delete fee structures" ON fee_structures;

CREATE POLICY "Users can view fee structures of their school"
  ON fee_structures FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can create fee structures"
  ON fee_structures FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant'))
  );

CREATE POLICY "Admins can update fee structures"
  ON fee_structures FOR UPDATE
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant'))
  )
  WITH CHECK (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant'))
  );

CREATE POLICY "Admins can delete fee structures"
  ON fee_structures FOR DELETE
  USING (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('accountant'))
  );

-- =====================================================
-- 4. Ensure students INSERT policy works correctly
-- =====================================================

-- Drop and recreate students INSERT policy to ensure it's correct
DROP POLICY IF EXISTS "Admins and teachers can manage students" ON students;
DROP POLICY IF EXISTS "Admins and teachers can insert students" ON students;

DROP POLICY IF EXISTS "Admins and teachers can insert students" ON students;
CREATE POLICY "Admins and teachers can insert students"
  ON students FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('teacher') OR user_has_role('branch_admin'))
  );

-- =====================================================
-- 5. Fix school_settings policy that queries user_schools directly
-- (Only if the table exists)
-- =====================================================

DO $$
BEGIN
  -- Check if school_settings table exists before creating policies
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'school_settings'
  ) THEN
    -- Drop existing policy if it exists
    DROP POLICY IF EXISTS "Admins can manage school settings of their school" ON school_settings;
    DROP POLICY IF EXISTS "Admins can manage school settings" ON school_settings;

    -- Create new policy
    CREATE POLICY "Admins can manage school settings"
      ON school_settings FOR ALL
      USING (
        school_id = get_user_school_id()
        AND (user_has_role('school_admin') OR user_has_role('super_admin'))
      )
      WITH CHECK (
        school_id = get_user_school_id()
        AND (user_has_role('school_admin') OR user_has_role('super_admin'))
      );
  END IF;
END $$;

-- =====================================================
-- 6. Fix classes INSERT policy to avoid recursion
-- =====================================================

-- Drop existing classes INSERT policy if it exists
DROP POLICY IF EXISTS "Admins can insert classes in their school and branch" ON classes;
DROP POLICY IF EXISTS "Users can access classes of their school" ON classes;

-- Check if branch access control migration was applied
DO $$
BEGIN
  -- Check if user_has_branch_access function exists (from migration 011)
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'user_has_branch_access'
  ) THEN
    -- Branch-aware policy (if migration 011 was applied)
    CREATE POLICY "Admins can insert classes in their school and branch"
      ON classes FOR INSERT
      WITH CHECK (
        school_id = get_user_school_id()
        AND (
          user_has_all_branches_access()
          OR branch_id = get_user_branch_id()
          OR branch_id IS NULL
        )
        AND (user_has_role('super_admin') OR user_has_role('school_admin') OR user_has_role('branch_admin'))
      );
  ELSE
    -- Simple policy (if migration 011 was not applied)
    CREATE POLICY "Admins can insert classes in their school"
      ON classes FOR INSERT
      WITH CHECK (
        school_id = get_user_school_id()
        AND (user_has_role('school_admin') OR user_has_role('super_admin'))
      );
  END IF;
END $$;

-- =====================================================
-- 6. Fix classes INSERT policy to avoid recursion
-- =====================================================

-- Drop existing classes policies that might query user_schools directly
DROP POLICY IF EXISTS "Admins can insert classes in their school and branch" ON classes;
DROP POLICY IF EXISTS "Admins can insert classes in their school" ON classes;
DROP POLICY IF EXISTS "Users can access classes of their school" ON classes;
DROP POLICY IF EXISTS "Users can view classes of their school" ON classes;
DROP POLICY IF EXISTS "Users can view classes in their school and branch" ON classes;

-- Check if branch access control migration was applied
DO $$
BEGIN
  -- Check if user_has_branch_access function exists (from migration 011)
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'user_has_branch_access'
  )   THEN
    -- Branch-aware policy (if migration 011 was applied)
    -- Drop any existing policies first
    DROP POLICY IF EXISTS "Admins can insert classes in their school and branch" ON classes;
    DROP POLICY IF EXISTS "Users can view classes in their school and branch" ON classes;
    
    -- Use user_has_role() instead of direct user_schools query to avoid recursion
    CREATE POLICY "Admins can insert classes in their school and branch"
      ON classes FOR INSERT
      WITH CHECK (
        school_id = get_user_school_id()
        AND (
          user_has_all_branches_access()
          OR branch_id = get_user_branch_id()
          OR branch_id IS NULL
        )
        AND (user_has_role('super_admin') OR user_has_role('school_admin') OR user_has_role('branch_admin'))
      );
    
    -- Recreate SELECT policy for branch-aware setup
    CREATE POLICY "Users can view classes in their school and branch"
      ON classes FOR SELECT
      USING (
        school_id = get_user_school_id()
        AND user_has_branch_access(branch_id)
      );
  ELSE
    -- Simple policy (if migration 011 was not applied)
    -- Drop any existing policies first
    DROP POLICY IF EXISTS "Admins can insert classes in their school" ON classes;
    DROP POLICY IF EXISTS "Users can view classes of their school" ON classes;
    
    CREATE POLICY "Admins can insert classes in their school"
      ON classes FOR INSERT
      WITH CHECK (
        school_id = get_user_school_id()
        AND (user_has_role('school_admin') OR user_has_role('super_admin'))
      );
    
    -- Recreate SELECT policy for simple setup
    CREATE POLICY "Users can view classes of their school"
      ON classes FOR SELECT
      USING (school_id = get_user_school_id());
  END IF;
END $$;

-- =====================================================
-- 7. Fix sections INSERT policy to avoid recursion
-- =====================================================

-- Drop existing sections policies
DROP POLICY IF EXISTS "Users can access sections of their school" ON sections;
DROP POLICY IF EXISTS "Admins can insert sections" ON sections;
DROP POLICY IF EXISTS "Users can view sections in their school and branch" ON sections;

-- Check if branch access control migration was applied
DO $$
BEGIN
  -- Check if user_has_branch_access function exists (from migration 011)
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'user_has_branch_access'
  )   THEN
    -- Branch-aware policy (if migration 011 was applied)
    -- Drop any existing policies first
    DROP POLICY IF EXISTS "Admins can insert sections" ON sections;
    DROP POLICY IF EXISTS "Users can view sections in their school and branch" ON sections;
    
    CREATE POLICY "Admins can insert sections"
      ON sections FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM classes c
          WHERE c.id = class_id
          AND c.school_id = get_user_school_id()
          AND (user_has_all_branches_access() OR c.branch_id = get_user_branch_id() OR c.branch_id IS NULL)
        )
        AND (user_has_role('super_admin') OR user_has_role('school_admin') OR user_has_role('branch_admin'))
      );
    
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
  ELSE
    -- Simple policy (if migration 011 was not applied)
    -- Drop any existing policies first
    DROP POLICY IF EXISTS "Admins can insert sections" ON sections;
    DROP POLICY IF EXISTS "Users can view sections of their school" ON sections;
    
    -- Use a simpler check that doesn't rely on EXISTS subquery
    CREATE POLICY "Admins can insert sections"
      ON sections FOR INSERT
      WITH CHECK (
        (user_has_role('school_admin') OR user_has_role('super_admin'))
        AND EXISTS (
          SELECT 1 FROM classes c
          WHERE c.id = class_id
          AND c.school_id = get_user_school_id()
        )
      );
    
    CREATE POLICY "Users can view sections of their school"
      ON sections FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM classes c
          WHERE c.id = sections.class_id
          AND c.school_id = get_user_school_id()
        )
      );
  END IF;
END $$;

-- =====================================================
-- 8. Ensure academic_years INSERT policy works
-- =====================================================

-- Drop existing academic_years policies
DROP POLICY IF EXISTS "Users can access academic years of their school" ON academic_years;

-- Recreate academic_years policy
CREATE POLICY "Users can access academic years of their school"
  ON academic_years FOR ALL
  USING (school_id = get_user_school_id())
  WITH CHECK (
    school_id = get_user_school_id()
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );

-- =====================================================
-- Done! Refresh your browser and try saving again.
-- =====================================================
