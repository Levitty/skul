-- Setup script for creating your first school and admin user
-- Run this in Supabase SQL Editor after creating your first user account

-- Step 1: Create a school (replace with your school details)
INSERT INTO schools (name, code, address, phone, email, is_active, deployment_mode)
VALUES (
  'Demo School',
  'DEMO001',
  '123 School Street, City',
  '+254700000000',
  'admin@demoschool.com',
  true,
  'shared'
)
RETURNING id;

-- Step 2: Link your user to the school
-- Replace 'YOUR_USER_EMAIL' with the email you used to sign up
-- Replace 'YOUR_SCHOOL_ID' with the ID returned from Step 1

INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'school_admin' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'YOUR_USER_EMAIL'
  AND s.code = 'DEMO001'
ON CONFLICT (user_id, school_id) DO NOTHING;

-- Step 3: Create a user profile (if not exists)
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'YOUR_USER_EMAIL'
  AND s.code = 'DEMO001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id;

-- Step 4: Create a sample academic year
INSERT INTO academic_years (school_id, name, start_date, end_date, is_current)
SELECT 
  s.id,
  '2024-2025',
  '2024-01-01',
  '2024-12-31',
  true
FROM schools s
WHERE s.code = 'DEMO001'
ON CONFLICT (school_id, name) DO NOTHING;

-- Step 5: Create sample classes
INSERT INTO classes (school_id, name, level, description)
SELECT 
  s.id,
  unnest(ARRAY['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6']),
  unnest(ARRAY[1, 2, 3, 4, 5, 6]),
  'Primary School Classes'
FROM schools s
WHERE s.code = 'DEMO001'
ON CONFLICT (school_id, name) DO NOTHING;

-- Verify setup
SELECT 
  s.name as school_name,
  u.email as admin_email,
  us.role as user_role
FROM schools s
JOIN user_schools us ON us.school_id = s.id
JOIN auth.users u ON u.id = us.user_id
WHERE s.code = 'DEMO001';




