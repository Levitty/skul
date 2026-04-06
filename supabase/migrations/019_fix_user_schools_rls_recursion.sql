-- Fix infinite recursion in user_schools RLS policies
-- The issue: The SELECT policy was querying user_schools from within itself
-- Solution: Use the SECURITY DEFINER helper function instead

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
