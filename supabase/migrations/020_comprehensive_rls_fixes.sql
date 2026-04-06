-- Comprehensive RLS fixes for user_schools recursion and missing policies
-- This fixes the infinite recursion and adds missing INSERT/UPDATE policies

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
-- This is needed for initial setup when users don't have a record yet
CREATE POLICY "Users can insert their own school associations"
  ON user_schools FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Add UPDATE policy to allow users to update their own school associations
CREATE POLICY "Users can update their own school associations"
  ON user_schools FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Also allow super_admins to manage all user_schools records
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
-- This avoids recursion when checking school access
CREATE OR REPLACE FUNCTION user_can_access_school(target_school_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_schools 
    WHERE user_id = auth.uid() 
    AND school_id = target_school_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Recreate SELECT policy using the helper function
CREATE POLICY "Users can view their school"
  ON schools FOR SELECT
  USING (user_can_access_school(id));

-- Allow school admins to insert new schools
-- This allows users to create their first school
CREATE POLICY "Users can create schools"
  ON schools FOR INSERT
  WITH CHECK (true); -- Allow anyone authenticated to create a school initially

-- Allow school admins to update their own school
CREATE POLICY "School admins can update their school"
  ON schools FOR UPDATE
  USING (user_can_access_school(id) AND user_has_role('school_admin'))
  WITH CHECK (user_can_access_school(id) AND user_has_role('school_admin'));

-- Super admins can manage all schools
CREATE POLICY "Super admins can manage all schools"
  ON schools FOR ALL
  USING (user_has_role('super_admin'))
  WITH CHECK (user_has_role('super_admin'));

-- =====================================================
-- 3. Fix fee_structures RLS policies (ensure INSERT works)
-- =====================================================

-- Check if fee_structures policies exist and add INSERT if missing
DO $$
BEGIN
  -- Check if INSERT policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'fee_structures' 
    AND policyname LIKE '%INSERT%'
  ) THEN
    -- Create INSERT policy for fee structures
    CREATE POLICY "Admins can create fee structures"
      ON fee_structures FOR INSERT
      WITH CHECK (
        school_id = get_user_school_id() 
        AND (user_has_role('school_admin') OR user_has_role('accountant'))
      );
  END IF;
END $$;

-- =====================================================
-- 4. Ensure students INSERT policy works correctly
-- =====================================================

-- The students INSERT policy should already exist, but let's verify it uses the right function
-- Drop and recreate to ensure it's correct
DROP POLICY IF EXISTS "Admins and teachers can manage students" ON students;

CREATE POLICY "Admins and teachers can insert students"
  ON students FOR INSERT
  WITH CHECK (
    school_id = get_user_school_id() 
    AND (user_has_role('school_admin') OR user_has_role('teacher') OR user_has_role('branch_admin'))
  );

-- =====================================================
-- 5. Fix any other policies that query user_schools directly
-- =====================================================

-- Fix the school_settings policy that queries user_schools directly
DROP POLICY IF EXISTS "Admins can manage school settings of their school" ON school_settings;

CREATE POLICY "Admins can manage school settings of their school"
  ON school_settings FOR ALL
  USING (
    school_id = get_user_school_id()
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  )
  WITH CHECK (
    school_id = get_user_school_id()
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );
