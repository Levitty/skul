-- =============================================
-- 029: Nursing / Health Module
-- =============================================

-- Student health profiles
CREATE TABLE IF NOT EXISTS student_health_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    blood_group TEXT,
    allergies TEXT,
    chronic_conditions TEXT,
    current_medications TEXT,
    immunization_notes TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    doctor_name TEXT,
    doctor_phone TEXT,
    insurance_provider TEXT,
    insurance_number TEXT,
    special_needs TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_health_profiles_school ON student_health_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_health_profiles_student ON student_health_profiles(student_id);

-- Clinic visit records
CREATE TABLE IF NOT EXISTS clinic_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    visit_date TIMESTAMPTZ DEFAULT NOW(),
    complaint TEXT NOT NULL,
    diagnosis TEXT,
    treatment TEXT,
    medication_given TEXT,
    temperature NUMERIC(4, 1),
    blood_pressure TEXT,
    weight NUMERIC(5, 1),
    action_taken TEXT CHECK (action_taken IN ('treated', 'sent_home', 'referred', 'observation')),
    parent_notified BOOLEAN DEFAULT false,
    follow_up_needed BOOLEAN DEFAULT false,
    follow_up_date DATE,
    notes TEXT,
    attended_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_visits_school ON clinic_visits(school_id);
CREATE INDEX IF NOT EXISTS idx_clinic_visits_student ON clinic_visits(student_id);
CREATE INDEX IF NOT EXISTS idx_clinic_visits_date ON clinic_visits(visit_date);

-- Medication inventory (school clinic stock)
CREATE TABLE IF NOT EXISTS clinic_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    quantity INT DEFAULT 0 CHECK (quantity >= 0),
    unit TEXT DEFAULT 'pcs',
    reorder_level INT DEFAULT 5,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_inv_school ON clinic_inventory(school_id);

-- RLS
ALTER TABLE student_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_profiles_school_access" ON student_health_profiles
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "clinic_visits_school_access" ON clinic_visits
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "clinic_inventory_school_access" ON clinic_inventory
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );
