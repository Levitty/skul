-- Add user_id to students table so students can log in to the portal
ALTER TABLE students
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
