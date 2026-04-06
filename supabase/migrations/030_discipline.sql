-- =============================================
-- 030: Student Behavioral Management / Discipline
-- =============================================

-- Discipline categories (configurable per school)
CREATE TABLE IF NOT EXISTS discipline_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
    default_action TEXT,
    points INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discipline_cats_school ON discipline_categories(school_id);

-- Discipline incidents
CREATE TABLE IF NOT EXISTS discipline_incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    category_id UUID REFERENCES discipline_categories(id),
    incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    location TEXT,
    witnesses TEXT,
    severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
    action_taken TEXT,
    punishment TEXT,
    parent_notified BOOLEAN DEFAULT false,
    parent_response TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'escalated')),
    reported_by UUID REFERENCES auth.users(id),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discipline_incidents_school ON discipline_incidents(school_id);
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_student ON discipline_incidents(student_id);
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_date ON discipline_incidents(incident_date);

-- Merit / reward points (positive reinforcement)
CREATE TABLE IF NOT EXISTS merit_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    points INT NOT NULL,
    reason TEXT NOT NULL,
    awarded_by UUID REFERENCES auth.users(id),
    awarded_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merit_points_school ON merit_points(school_id);
CREATE INDEX IF NOT EXISTS idx_merit_points_student ON merit_points(student_id);

-- RLS
ALTER TABLE discipline_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE discipline_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE merit_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discipline_categories_school_access" ON discipline_categories
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "discipline_incidents_school_access" ON discipline_incidents
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "merit_points_school_access" ON merit_points
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );
