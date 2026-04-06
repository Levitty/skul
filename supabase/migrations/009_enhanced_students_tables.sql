-- Enhanced Students Tables Migration

-- Add additional columns to students table
ALTER TABLE students
ADD COLUMN IF NOT EXISTS religion TEXT,
ADD COLUMN IF NOT EXISTS blood_group TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS extra_notes TEXT,
ADD COLUMN IF NOT EXISTS dob_in_words TEXT,
ADD COLUMN IF NOT EXISTS birth_place TEXT,
ADD COLUMN IF NOT EXISTS previous_school_name TEXT,
ADD COLUMN IF NOT EXISTS previous_school_address TEXT,
ADD COLUMN IF NOT EXISTS previous_school_class TEXT,
ADD COLUMN IF NOT EXISTS previous_school_passout_year INTEGER,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS suspension_start_date DATE,
ADD COLUMN IF NOT EXISTS suspension_end_date DATE;

-- Add occupation column to guardians if not exists
ALTER TABLE guardians
ADD COLUMN IF NOT EXISTS occupation TEXT;

-- Emergency Contacts table
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

-- Student Transfers table
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
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transport Routes table
CREATE TABLE IF NOT EXISTS transport_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    fee_amount DECIMAL(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hostels table
CREATE TABLE IF NOT EXISTS hostels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('boys', 'girls', 'mixed')),
    capacity INTEGER,
    current_occupancy INTEGER DEFAULT 0,
    fee_amount DECIMAL(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_student_id ON emergency_contacts(student_id);
CREATE INDEX IF NOT EXISTS idx_student_transfers_student_id ON student_transfers(student_id);
CREATE INDEX IF NOT EXISTS idx_student_transfers_from_school ON student_transfers(from_school_id);
CREATE INDEX IF NOT EXISTS idx_student_transfers_to_school ON student_transfers(to_school_id);
CREATE INDEX IF NOT EXISTS idx_transport_routes_school_id ON transport_routes(school_id);
CREATE INDEX IF NOT EXISTS idx_hostels_school_id ON hostels(school_id);

-- Enable RLS
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostels ENABLE ROW LEVEL SECURITY;

-- RLS Policies for emergency_contacts
CREATE POLICY "Users can view emergency contacts of students in their school"
  ON emergency_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s 
      WHERE s.id = emergency_contacts.student_id 
      AND s.school_id = get_user_school_id()
    )
  );

CREATE POLICY "Admins can manage emergency contacts"
  ON emergency_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM students s 
      WHERE s.id = emergency_contacts.student_id 
      AND s.school_id = get_user_school_id()
    )
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );

-- RLS Policies for student_transfers
CREATE POLICY "Users can view transfers involving their school"
  ON student_transfers FOR SELECT
  USING (
    from_school_id = get_user_school_id() OR to_school_id = get_user_school_id()
  );

CREATE POLICY "Admins can manage transfers"
  ON student_transfers FOR ALL
  USING (
    (from_school_id = get_user_school_id() OR to_school_id = get_user_school_id())
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );

-- RLS Policies for transport_routes
CREATE POLICY "Users can view transport routes of their school"
  ON transport_routes FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage transport routes"
  ON transport_routes FOR ALL
  USING (
    school_id = get_user_school_id()
    AND (user_has_role('school_admin') OR user_has_role('super_admin') OR user_has_role('transport_manager'))
  );

-- RLS Policies for hostels
CREATE POLICY "Users can view hostels of their school"
  ON hostels FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage hostels"
  ON hostels FOR ALL
  USING (
    school_id = get_user_school_id()
    AND (user_has_role('school_admin') OR user_has_role('super_admin') OR user_has_role('hostel_manager'))
  );



