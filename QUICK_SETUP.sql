-- ============================================
-- QUICK SETUP SCRIPT - CREATE YOUR SCHOOL
-- ============================================
-- Replace YOUR_EMAIL_HERE with the email you used to sign up
-- Then copy this entire script and run it in Supabase SQL Editor

-- Step 1: Create your school
INSERT INTO schools (name, code, address, phone, email, is_active, deployment_mode)
VALUES (
  'My Demo School',                    -- Change this to your school name
  'DEMO001',                           -- Change this to your school code
  '123 School Street, Nairobi',       -- Change to your address
  '+254700000000',                     -- Change to your phone
  'admin@myschool.com',               -- Change to your email
  true,
  'shared'
)
RETURNING id, name, code;

-- Step 2: Link your user account to the school
-- IMPORTANT: Replace 'YOUR_EMAIL_HERE' with your actual signup email!
INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'school_admin' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'mlevitty@gmail.com'     -- ✅ Your email
  AND s.code = 'DEMO001'
ON CONFLICT (user_id, school_id) DO NOTHING
RETURNING user_id, school_id, role;

-- Step 3: Create user profile
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'mlevitty@gmail.com'     -- ✅ Your email
  AND s.code = 'DEMO001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id
RETURNING id, full_name;

-- Step 4: Create current academic year
INSERT INTO academic_years (school_id, name, start_date, end_date, is_current)
SELECT 
  s.id,
  '2025 Academic Year',
  '2025-01-01',
  '2025-12-31',
  true
FROM schools s
WHERE s.code = 'DEMO001'
ON CONFLICT (school_id, name) DO NOTHING
RETURNING id, name, is_current;

-- Step 5: Create sample classes
INSERT INTO classes (school_id, name, level, description)
SELECT 
  s.id,
  unnest(ARRAY['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8']),
  unnest(ARRAY[1, 2, 3, 4, 5, 6, 7, 8]),
  'Primary and Junior Secondary'
FROM schools s
WHERE s.code = 'DEMO001'
ON CONFLICT (school_id, name) DO NOTHING
RETURNING id, name, level;

-- Step 6: Verify everything worked
SELECT 
  s.name as school_name,
  s.code as school_code,
  u.email as admin_email,
  us.role as user_role,
  ay.name as current_year,
  COUNT(c.id) as total_classes
FROM schools s
JOIN user_schools us ON us.school_id = s.id
JOIN auth.users u ON u.id = us.user_id
LEFT JOIN academic_years ay ON ay.school_id = s.id AND ay.is_current = true
LEFT JOIN classes c ON c.school_id = s.id
WHERE s.code = 'DEMO001'
GROUP BY s.name, s.code, u.email, us.role, ay.name;

