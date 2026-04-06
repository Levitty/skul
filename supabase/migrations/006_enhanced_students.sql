-- Migration: Enhanced Students Module
-- This migration adds comprehensive student fields, emergency contacts, suspensions, transfers, inquiries, and branches

-- Add new columns to students table
ALTER TABLE students
ADD COLUMN IF NOT EXISTS religion TEXT,
ADD COLUMN IF NOT EXISTS blood_group TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS extra_notes TEXT,
ADD COLUMN IF NOT EXISTS dob_in_words TEXT,
ADD COLUMN IF NOT EXISTS birth_place TEXT,
ADD COLUMN IF NOT EXISTS previous_school_name TEXT,
ADD COLUMN IF NOT EXISTS previous_school_address TEXT,
ADD COLUMN IF NOT EXISTS previous_school_class TEXT,
ADD COLUMN IF NOT EXISTS previous_school_passout_year INTEGER,
ADD COLUMN IF NOT EXISTS admission_date DATE,
ADD COLUMN IF NOT EXISTS roll_number TEXT,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS suspension_start_date DATE,
ADD COLUMN IF NOT EXISTS suspension_end_date DATE;

-- Update status enum to include 'suspended' and 'inactive'
ALTER TABLE students
DROP CONSTRAINT IF EXISTS students_status_check;

ALTER TABLE students
ADD CONSTRAINT students_status_check 
CHECK (status IN ('active', 'inactive', 'suspended', 'graduated', 'exited', 'transferred'));

-- Emergency Contacts (separate from guardians)
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relation TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Suspensions (audit trail)
CREATE TABLE IF NOT EXISTS student_suspensions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'revoked')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Transfers (in and out)
CREATE TABLE IF NOT EXISTS student_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    transfer_type TEXT NOT NULL CHECK (transfer_type IN ('transfer_in', 'transfer_out')),
    from_school_id UUID REFERENCES schools(id),
    to_school_id UUID REFERENCES schools(id),
    from_class_id UUID REFERENCES classes(id),
    to_class_id UUID REFERENCES classes(id),
    transfer_date DATE NOT NULL,
    reason TEXT,
    documents_url TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inquiries (pre-admission leads)
CREATE TABLE IF NOT EXISTS inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    guardian_phone TEXT NOT NULL,
    guardian_email TEXT,
    interested_class_id UUID REFERENCES classes(id),
    source TEXT, -- 'website', 'walk_in', 'referral', etc.
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'scheduled', 'converted', 'lost')),
    notes TEXT,
    converted_to_application_id UUID REFERENCES applications(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- School Branches
CREATE TABLE IF NOT EXISTS school_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    manager_user_id UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Hostels (boarding facilities)
CREATE TABLE IF NOT EXISTS hostels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capacity INTEGER,
    current_occupancy INTEGER DEFAULT 0,
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Transport Routes
CREATE TABLE IF NOT EXISTS transport_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    route_number TEXT,
    start_location TEXT,
    end_location TEXT,
    fee_amount NUMERIC(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Subjects (for class-subject mapping)
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Class Subjects (many-to-many: which subjects are taught in which classes)
CREATE TABLE IF NOT EXISTS class_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, subject_id)
);

-- Student Subjects (which subjects a student is enrolled in)
CREATE TABLE IF NOT EXISTS student_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, subject_id, academic_year_id)
);

-- Update student_services to reference transport_routes
ALTER TABLE student_services
ADD COLUMN IF NOT EXISTS transport_route_id UUID REFERENCES transport_routes(id),
ADD COLUMN IF NOT EXISTS hostel_id UUID REFERENCES hostels(id);

-- Roll number generator function (per class/section, per academic year)
CREATE OR REPLACE FUNCTION generate_roll_number(
    p_student_id UUID,
    p_class_id UUID,
    p_section_id UUID,
    p_academic_year_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_roll_number TEXT;
    v_count INTEGER;
BEGIN
    -- Get the highest roll number for this class/section/academic_year
    SELECT COALESCE(MAX(CAST(roll_number AS INTEGER)), 0) + 1
    INTO v_count
    FROM students s
    JOIN enrollments e ON e.student_id = s.id
    WHERE e.class_id = p_class_id
      AND (p_section_id IS NULL OR e.section_id = p_section_id)
      AND e.academic_year_id = p_academic_year_id
      AND s.roll_number IS NOT NULL
      AND s.roll_number ~ '^[0-9]+$';
    
    v_roll_number := LPAD(v_count::TEXT, 3, '0');
    RETURN v_roll_number;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_student_id ON emergency_contacts(student_id);
CREATE INDEX IF NOT EXISTS idx_student_suspensions_student_id ON student_suspensions(student_id);
CREATE INDEX IF NOT EXISTS idx_student_suspensions_status ON student_suspensions(status);
CREATE INDEX IF NOT EXISTS idx_student_transfers_student_id ON student_transfers(student_id);
CREATE INDEX IF NOT EXISTS idx_student_transfers_type ON student_transfers(transfer_type);
CREATE INDEX IF NOT EXISTS idx_inquiries_school_id ON inquiries(school_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_school_branches_school_id ON school_branches(school_id);
CREATE INDEX IF NOT EXISTS idx_school_branches_manager ON school_branches(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_hostels_school_id ON hostels(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_routes_school_id ON transport_routes(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class_id ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject_id ON class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_student_id ON student_subjects(student_id);
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON students(roll_number);
CREATE INDEX IF NOT EXISTS idx_students_admission_date ON students(admission_date);



