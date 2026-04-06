# Database Setup Guide

## Step 1: Run Database Migrations

You need to run the SQL migrations in your Supabase project to create all the tables.

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://supabase.com/dashboard/project/bgauvkedqzsxnwstdzsk
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Wait for it to complete (should take a few seconds)
8. Repeat steps 4-6 for `supabase/migrations/002_rls_policies.sql`

### Option B: Using Supabase CLI (Advanced)

If you have Supabase CLI installed:

```bash
supabase db push
```

## Step 2: Verify Tables Were Created

After running migrations:

1. In Supabase Dashboard, go to **Table Editor**
2. You should see many tables including:
   - `schools`
   - `students`
   - `users`
   - `invoices`
   - `payments`
   - etc.

## Step 3: Create Your First School and Admin User

### Quick Setup Script

1. Go to **SQL Editor** in Supabase
2. Copy and paste the script below
3. **IMPORTANT:** Replace `YOUR_EMAIL_HERE` with the email you used to sign up
4. Click **Run**

```sql
-- Step 1: Create your school
INSERT INTO schools (name, code, address, phone, email, is_active, deployment_mode)
VALUES (
  'Demo School',
  'DEMO001',
  '123 School Street',
  '+254700000000',
  'admin@demoschool.com',
  true,
  'shared'
)
RETURNING id;

-- Step 2: Link your user to the school
-- Replace YOUR_EMAIL_HERE with your actual email
INSERT INTO user_schools (user_id, school_id, role)
SELECT 
  u.id as user_id,
  s.id as school_id,
  'school_admin' as role
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'YOUR_EMAIL_HERE'  -- CHANGE THIS!
  AND s.code = 'DEMO001'
ON CONFLICT (user_id, school_id) DO NOTHING;

-- Step 3: Create user profile
INSERT INTO user_profiles (id, school_id, full_name)
SELECT 
  u.id,
  s.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
CROSS JOIN schools s
WHERE u.email = 'YOUR_EMAIL_HERE'  -- CHANGE THIS!
  AND s.code = 'DEMO001'
ON CONFLICT (id) DO UPDATE
SET school_id = EXCLUDED.school_id;

-- Step 4: Create sample academic year
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
```

## Step 4: Test the Application

1. Visit http://localhost:3000
2. Sign up or log in with your email
3. You should be redirected to `/dashboard`
4. You should see the dashboard with your school data

## Troubleshooting

### "Table does not exist" error
- Make sure you ran both migration files
- Check that migrations completed successfully (no errors)

### "User not associated with any school" error
- Make sure you ran the setup script
- Verify your email matches exactly (case-sensitive)
- Check the `user_schools` table in Table Editor

### Can't see tables in Table Editor
- Refresh the page
- Make sure you're in the correct project
- Check that migrations ran successfully

## Next Steps After Database Setup

Once the database is set up:
1. ✅ Test login/signup
2. ✅ Create your first student
3. ✅ Set up fee structures
4. ✅ Test attendance tracking
5. ✅ Configure payment gateways (optional)




