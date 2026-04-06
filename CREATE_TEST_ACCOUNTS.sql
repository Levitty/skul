-- ============================================
-- CREATE TEST ACCOUNTS FOR DIFFERENT ROLES
-- ============================================
-- Run this in Supabase SQL Editor after users have signed up

-- NOTE: Users must first sign up through the app at /signup
-- Then run this script to assign them roles and link to students

-- ============================================
-- 1. CREATE A PARENT ACCOUNT
-- ============================================
-- First, have a user sign up with email: parent@test.com
-- Then run this to give them parent access:

-- Link parent user to school and assign role
INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'parent' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'parent@test.com'  -- Change to actual parent email
  AND s.code = 'DEMO001'
ON CONFLICT (user_id, school_id) DO UPDATE
SET role = 'parent'
RETURNING user_id, school_id, role;

-- Create user profile for parent
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  'Test Parent'
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'parent@test.com'
  AND s.code = 'DEMO001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name
RETURNING id, full_name;

-- Create a student linked to this parent
INSERT INTO students (
  school_id,
  admission_number,
  first_name,
  last_name,
  date_of_birth,
  gender,
  email,
  status
)
SELECT 
  s.id,
  'STD001',
  'John',
  'Doe',
  '2010-05-15',
  'male',
  'student@test.com',
  'active'
FROM schools s
WHERE s.code = 'DEMO001'
ON CONFLICT DO NOTHING
RETURNING id, first_name, last_name, admission_number;

-- Link the student to the parent (get student_id from above)
-- Replace 'STUDENT_ID_HERE' with the actual UUID from the student insert
INSERT INTO guardians (
  school_id,
  student_id,
  user_id,
  relationship,
  first_name,
  last_name,
  email,
  phone,
  is_primary
)
SELECT 
  s.id,
  st.id,
  u.id,
  'parent',
  'Test',
  'Parent',
  'parent@test.com',
  '+254700000000',
  true
FROM schools s
CROSS JOIN auth.users u
CROSS JOIN students st
WHERE s.code = 'DEMO001'
  AND u.email = 'parent@test.com'
  AND st.admission_number = 'STD001'
ON CONFLICT DO NOTHING
RETURNING id, first_name, last_name, relationship;

-- ============================================
-- 2. CREATE A TEACHER ACCOUNT
-- ============================================
-- First, have a user sign up with email: teacher@test.com
-- Then run this:

INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'teacher' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'teacher@test.com'  -- Change to actual teacher email
  AND s.code = 'DEMO001'
ON CONFLICT (user_id, school_id) DO UPDATE
SET role = 'teacher'
RETURNING user_id, school_id, role;

-- Create user profile for teacher
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  'Test Teacher'
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'teacher@test.com'
  AND s.code = 'DEMO001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name
RETURNING id, full_name;

-- Create employee record for teacher
INSERT INTO employees (
  school_id,
  user_id,
  employee_number,
  first_name,
  last_name,
  email,
  phone,
  role,
  department,
  hire_date,
  status
)
SELECT 
  s.id,
  u.id,
  'EMP001',
  'Test',
  'Teacher',
  'teacher@test.com',
  '+254700000000',
  'teacher',
  'Mathematics',
  CURRENT_DATE,
  'active'
FROM schools s
CROSS JOIN auth.users u
WHERE s.code = 'DEMO001'
  AND u.email = 'teacher@test.com'
ON CONFLICT DO NOTHING
RETURNING id, first_name, last_name, employee_number;

-- ============================================
-- 3. CREATE AN ACCOUNTANT ACCOUNT
-- ============================================

INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'accountant' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'accountant@test.com'  -- Change to actual accountant email
  AND s.code = 'DEMO001'
ON CONFLICT (user_id, school_id) DO UPDATE
SET role = 'accountant'
RETURNING user_id, school_id, role;

-- Create user profile
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  'Test Accountant'
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'accountant@test.com'
  AND s.code = 'DEMO001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name
RETURNING id, full_name;

-- ============================================
-- VERIFY ALL ROLES
-- ============================================

SELECT 
  u.email,
  us.role,
  up.full_name,
  s.name as school_name
FROM auth.users u
JOIN user_schools us ON us.user_id = u.id
JOIN schools s ON s.id = us.school_id
LEFT JOIN user_profiles up ON up.id = u.id
WHERE s.code = 'DEMO001'
ORDER BY us.role, u.email;




