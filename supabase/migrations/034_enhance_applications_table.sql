-- Migration: Enhance Applications table with additional student information fields
-- This allows collecting comprehensive student details during the application process

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS medical_notes TEXT,
ADD COLUMN IF NOT EXISTS previous_school_name TEXT,
ADD COLUMN IF NOT EXISTS previous_school_address TEXT,
ADD COLUMN IF NOT EXISTS previous_school_class TEXT,
ADD COLUMN IF NOT EXISTS previous_school_passout_year INTEGER;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_applications_school_id ON applications(school_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_class_id ON applications(applied_class_id);
