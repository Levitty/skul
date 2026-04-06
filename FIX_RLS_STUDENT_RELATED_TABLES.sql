-- Fix RLS for student-related tables (guardians, emergency_contacts, enrollments, student_services, student_activities)
-- Run in Supabase SQL Editor.
--
-- This complements FIX_RLS_RECURSION.sql (which covers core tenant tables),
-- and ensures admitting a student also saves guardians/enrollments/etc.

-- Helper: can current user access a given student?
-- Uses existing user_can_access_school(school_id) SECURITY DEFINER helper from FIX_RLS_RECURSION.sql.
-- This function bypasses RLS to check student access.
CREATE OR REPLACE FUNCTION public.user_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_school_id uuid;
  v_user_id uuid;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- If no user, deny access
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get the school_id for this student directly (bypasses RLS due to SECURITY DEFINER)
  SELECT s.school_id INTO v_school_id
  FROM public.students s
  WHERE s.id = p_student_id
  LIMIT 1;
  
  -- If student doesn't exist, return false
  IF v_school_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user can access this school (using the helper function)
  -- If helper doesn't exist, fall back to direct check
  BEGIN
    RETURN public.user_can_access_school(v_school_id);
  EXCEPTION
    WHEN OTHERS THEN
      -- Fallback: direct check if helper function doesn't exist
      RETURN EXISTS (
        SELECT 1
        FROM public.user_schools us
        WHERE us.user_id = v_user_id
          AND us.school_id = v_school_id
      );
  END;
END;
$$;

-- GUARDIANS
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view guardians of their students" ON public.guardians;
DROP POLICY IF EXISTS "Users can insert guardians for their students" ON public.guardians;
DROP POLICY IF EXISTS "Users can update guardians of their students" ON public.guardians;
DROP POLICY IF EXISTS "Users can delete guardians of their students" ON public.guardians;

CREATE POLICY "Users can view guardians of their students"
ON public.guardians
FOR SELECT
USING (public.user_can_access_student(student_id));

CREATE POLICY "Users can insert guardians for their students"
ON public.guardians
FOR INSERT
WITH CHECK (public.user_can_access_student(student_id));

CREATE POLICY "Users can update guardians of their students"
ON public.guardians
FOR UPDATE
USING (public.user_can_access_student(student_id))
WITH CHECK (public.user_can_access_student(student_id));

CREATE POLICY "Users can delete guardians of their students"
ON public.guardians
FOR DELETE
USING (public.user_can_access_student(student_id));

-- EMERGENCY CONTACTS
-- Some projects don't have this table yet; guard it so the script still runs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'emergency_contacts'
  ) THEN
    ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view emergency contacts of their students" ON public.emergency_contacts;
    DROP POLICY IF EXISTS "Users can insert emergency contacts for their students" ON public.emergency_contacts;
    DROP POLICY IF EXISTS "Users can update emergency contacts of their students" ON public.emergency_contacts;
    DROP POLICY IF EXISTS "Users can delete emergency contacts of their students" ON public.emergency_contacts;

    CREATE POLICY "Users can view emergency contacts of their students"
    ON public.emergency_contacts
    FOR SELECT
    USING (public.user_can_access_student(student_id));

    CREATE POLICY "Users can insert emergency contacts for their students"
    ON public.emergency_contacts
    FOR INSERT
    WITH CHECK (public.user_can_access_student(student_id));

    CREATE POLICY "Users can update emergency contacts of their students"
    ON public.emergency_contacts
    FOR UPDATE
    USING (public.user_can_access_student(student_id))
    WITH CHECK (public.user_can_access_student(student_id));

    CREATE POLICY "Users can delete emergency contacts of their students"
    ON public.emergency_contacts
    FOR DELETE
    USING (public.user_can_access_student(student_id));
  END IF;
END $$;

-- ENROLLMENTS
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view enrollments of their students" ON public.enrollments;
DROP POLICY IF EXISTS "Users can insert enrollments for their students" ON public.enrollments;
DROP POLICY IF EXISTS "Users can update enrollments of their students" ON public.enrollments;
DROP POLICY IF EXISTS "Users can delete enrollments of their students" ON public.enrollments;

CREATE POLICY "Users can view enrollments of their students"
ON public.enrollments
FOR SELECT
USING (public.user_can_access_student(student_id));

CREATE POLICY "Users can insert enrollments for their students"
ON public.enrollments
FOR INSERT
WITH CHECK (public.user_can_access_student(student_id));

CREATE POLICY "Users can update enrollments of their students"
ON public.enrollments
FOR UPDATE
USING (public.user_can_access_student(student_id))
WITH CHECK (public.user_can_access_student(student_id));

CREATE POLICY "Users can delete enrollments of their students"
ON public.enrollments
FOR DELETE
USING (public.user_can_access_student(student_id));

-- STUDENT SERVICES (transport/boarding flags)
-- Guarded in case the table doesn't exist yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'student_services'
  ) THEN
    ALTER TABLE public.student_services ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view services of their students" ON public.student_services;
    DROP POLICY IF EXISTS "Users can insert services for their students" ON public.student_services;
    DROP POLICY IF EXISTS "Users can update services of their students" ON public.student_services;
    DROP POLICY IF EXISTS "Users can delete services of their students" ON public.student_services;

    CREATE POLICY "Users can view services of their students"
    ON public.student_services
    FOR SELECT
    USING (public.user_can_access_student(student_id));

    CREATE POLICY "Users can insert services for their students"
    ON public.student_services
    FOR INSERT
    WITH CHECK (public.user_can_access_student(student_id));

    CREATE POLICY "Users can update services of their students"
    ON public.student_services
    FOR UPDATE
    USING (public.user_can_access_student(student_id))
    WITH CHECK (public.user_can_access_student(student_id));

    CREATE POLICY "Users can delete services of their students"
    ON public.student_services
    FOR DELETE
    USING (public.user_can_access_student(student_id));
  END IF;
END $$;

-- STUDENT ACTIVITIES
-- Guarded in case the table doesn't exist yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'student_activities'
  ) THEN
    ALTER TABLE public.student_activities ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view activities of their students" ON public.student_activities;
    DROP POLICY IF EXISTS "Users can insert activities for their students" ON public.student_activities;
    DROP POLICY IF EXISTS "Users can update activities of their students" ON public.student_activities;
    DROP POLICY IF EXISTS "Users can delete activities of their students" ON public.student_activities;

    CREATE POLICY "Users can view activities of their students"
    ON public.student_activities
    FOR SELECT
    USING (public.user_can_access_student(student_id));

    CREATE POLICY "Users can insert activities for their students"
    ON public.student_activities
    FOR INSERT
    WITH CHECK (public.user_can_access_student(student_id));

    CREATE POLICY "Users can update activities of their students"
    ON public.student_activities
    FOR UPDATE
    USING (public.user_can_access_student(student_id))
    WITH CHECK (public.user_can_access_student(student_id));

    CREATE POLICY "Users can delete activities of their students"
    ON public.student_activities
    FOR DELETE
    USING (public.user_can_access_student(student_id));
  END IF;
END $$;

