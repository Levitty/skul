-- Fix missing address and other columns in students table
-- Run this if you get "Could not find the 'address' column" error

-- Add address column if it doesn't exist
ALTER TABLE students
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS religion TEXT,
ADD COLUMN IF NOT EXISTS blood_group TEXT,
ADD COLUMN IF NOT EXISTS extra_notes TEXT,
ADD COLUMN IF NOT EXISTS dob_in_words TEXT,
ADD COLUMN IF NOT EXISTS birth_place TEXT,
ADD COLUMN IF NOT EXISTS previous_school_name TEXT,
ADD COLUMN IF NOT EXISTS previous_school_address TEXT,
ADD COLUMN IF NOT EXISTS previous_school_class TEXT,
ADD COLUMN IF NOT EXISTS previous_school_passout_year INTEGER,
ADD COLUMN IF NOT EXISTS admission_date DATE,
ADD COLUMN IF NOT EXISTS roll_number TEXT,
ADD COLUMN IF NOT EXISTS middle_name TEXT;
