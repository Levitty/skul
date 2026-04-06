-- Migration: Add Terms, Student Services, Activities, and School Settings
-- This migration adds support for per-term billing, optional services (boarding/transport),
-- optional activities (coding, swimming, etc.), and per-school customization

-- Terms table (Term1, Term2, Term3 per academic year)
CREATE TABLE IF NOT EXISTS terms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "Term 1", "Term 2", "Term 3"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    due_date DATE NOT NULL, -- Invoice due date for this term
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, academic_year_id, name)
);

-- Student Services (boarding, transport flags per student)
CREATE TABLE IF NOT EXISTS student_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    boarding_enabled BOOLEAN DEFAULT false,
    transport_enabled BOOLEAN DEFAULT false,
    transport_route TEXT, -- Optional route name/identifier
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id)
);

-- Activities (optional fee-based activities like coding, swimming)
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "Coding Club", "Swimming Lessons"
    fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Student Activities (which students are enrolled in which activities per term)
CREATE TABLE IF NOT EXISTS student_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, activity_id, term_id)
);

-- School Settings (per-school configuration for SaaS customization)
CREATE TABLE IF NOT EXISTS school_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL, -- e.g., "invoice_template", "default_payment_method", "sms_enabled"
    setting_value JSONB NOT NULL, -- Flexible JSON value
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, setting_key)
);

-- Add term_id to fee_structures (link fees to specific terms)
ALTER TABLE fee_structures 
ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES terms(id) ON DELETE SET NULL;

-- Add term_id to invoices (so invoices are term-scoped)
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES terms(id) ON DELETE SET NULL;

-- Add school_id to payments for easier filtering and RLS (derived from invoice but stored for convenience)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- Create function to auto-populate payments.school_id from invoice
CREATE OR REPLACE FUNCTION set_payment_school_id()
RETURNS TRIGGER AS $$
BEGIN
    SELECT school_id INTO NEW.school_id
    FROM invoices
    WHERE id = NEW.invoice_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set school_id on payment insert/update
DROP TRIGGER IF EXISTS trigger_set_payment_school_id ON payments;
CREATE TRIGGER trigger_set_payment_school_id
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION set_payment_school_id();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_terms_school_academic_year ON terms(school_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_terms_is_current ON terms(is_current);
CREATE INDEX IF NOT EXISTS idx_student_services_student_id ON student_services(student_id);
CREATE INDEX IF NOT EXISTS idx_activities_school_id ON activities(school_id);
CREATE INDEX IF NOT EXISTS idx_student_activities_student_term ON student_activities(student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_school_settings_school_key ON school_settings(school_id, setting_key);
CREATE INDEX IF NOT EXISTS idx_fee_structures_term_id ON fee_structures(term_id);
CREATE INDEX IF NOT EXISTS idx_invoices_term_id ON invoices(term_id);
CREATE INDEX IF NOT EXISTS idx_payments_school_id ON payments(school_id);




