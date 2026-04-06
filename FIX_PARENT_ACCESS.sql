-- ============================================
-- QUICK FIX: Associate Current User as Parent
-- ============================================
-- Run this in Supabase SQL Editor to give your current account parent access

-- Step 1: Find your user ID (run this first to verify)
SELECT 
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'levitymutua@icloud.com';

-- Step 2: Link your current user to the school as a parent
-- This uses your email to find your user ID automatically
INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'parent' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'levitymutua@icloud.com'
  AND s.code = 'DEMO001'
ON CONFLICT (user_id, school_id) DO UPDATE
SET role = 'parent'
RETURNING user_id, school_id, role;

-- Step 3: Create user profile
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  'Test Parent'
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'levitymutua@icloud.com'
  AND s.code = 'DEMO001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name
RETURNING id, full_name;

-- Step 4: Create a student for this parent
INSERT INTO students (
  school_id,
  admission_number,
  first_name,
  last_name,
  dob,
  gender,
  status
)
SELECT 
  s.id,
  'STD001',
  'Alex',
  'Johnson',
  '2012-03-15',
  'male',
  'active'
FROM schools s
WHERE s.code = 'DEMO001'
ON CONFLICT (school_id, admission_number) DO NOTHING
RETURNING id, first_name, last_name, admission_number;

-- Step 5: Link the student to the parent (guardian)
-- Note: Guardians table uses 'name' and 'relation', not 'first_name', 'last_name', 'relationship'
-- First, delete any existing guardian for this student/email combination to avoid duplicates
DELETE FROM guardians 
WHERE student_id IN (
  SELECT st.id FROM students st 
  JOIN schools s ON s.id = st.school_id 
  WHERE st.admission_number = 'STD001' AND s.code = 'DEMO001'
)
AND email = 'levitymutua@icloud.com';

-- Now insert the guardian
INSERT INTO guardians (
  student_id,
  name,
  relation,
  email,
  phone,
  is_primary
)
SELECT 
  st.id as student_id,
  'Test Parent' as name,
  'parent' as relation,
  u.email,
  '+254700000000' as phone,
  true as is_primary
FROM auth.users u
CROSS JOIN students st
JOIN schools s ON s.id = st.school_id
WHERE u.email = 'levitymutua@icloud.com'
  AND st.admission_number = 'STD001'
  AND s.code = 'DEMO001'
RETURNING id, name, relation, email;

-- Step 6: Verify the setup
SELECT 
  u.email,
  us.role,
  up.full_name,
  s.name as school_name
FROM auth.users u
JOIN user_schools us ON us.user_id = u.id
JOIN schools s ON s.id = us.school_id
LEFT JOIN user_profiles up ON up.id = u.id
WHERE u.email = 'levitymutua@icloud.com';

-- Step 7: Verify the student-parent link
SELECT 
  s.first_name || ' ' || s.last_name as student_name,
  s.admission_number,
  g.name as guardian_name,
  g.relation,
  g.email as guardian_email
FROM students s
JOIN guardians g ON g.student_id = s.id
WHERE g.email = 'levitymutua@icloud.com';
