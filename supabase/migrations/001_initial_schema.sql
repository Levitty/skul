-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schools table (Tenant master)
CREATE TABLE schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    deployment_mode TEXT DEFAULT 'shared' CHECK (deployment_mode IN ('shared', 'isolated')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Academic Years
CREATE TABLE academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Classes (Grade levels)
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    level INTEGER,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Sections (Class sections)
CREATE TABLE sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capacity INTEGER,
    room_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(class_id, name)
);

-- Students
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    middle_name TEXT,
    dob DATE,
    gender TEXT,
    admission_number TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'graduated', 'exited', 'transferred')),
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, admission_number)
);

-- Guardians
CREATE TABLE guardians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relation TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    is_billing_contact BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Applications
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dob DATE,
    gender TEXT,
    guardian_name TEXT NOT NULL,
    guardian_phone TEXT NOT NULL,
    guardian_email TEXT,
    applied_class_id UUID REFERENCES classes(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'interviewed', 'accepted', 'rejected', 'waitlisted')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enrollments
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section_id UUID REFERENCES sections(id),
    enrollment_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, academic_year_id)
);

-- Student Documents
CREATE TABLE student_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_size INTEGER,
    uploaded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (extends Supabase auth.users)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-School relationships (for multi-tenant)
CREATE TABLE user_schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'school_admin', 'teacher', 'parent', 'student', 'accountant', 'librarian', 'nurse', 'transport_manager', 'hostel_manager')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, school_id)
);

-- Employees (Staff)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    employee_number TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    position TEXT,
    department TEXT,
    hire_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, employee_number)
);

-- Periods
CREATE TABLE periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    order_index INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Rooms
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capacity INTEGER,
    room_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Timetables
CREATE TABLE timetables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timetable Entries
CREATE TABLE timetable_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timetable_id UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section_id UUID REFERENCES sections(id),
    period_id UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    subject TEXT NOT NULL,
    teacher_id UUID REFERENCES employees(id),
    room_id UUID REFERENCES rooms(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance Records
CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    period_id UUID REFERENCES periods(id),
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    note TEXT,
    recorded_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, date, period_id)
);

-- Fee Structures
CREATE TABLE fee_structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id),
    name TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    fee_type TEXT NOT NULL CHECK (fee_type IN ('tuition', 'uniform', 'transport', 'exam', 'library', 'hostel', 'other')),
    due_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    reference TEXT UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue', 'cancelled')),
    due_date DATE,
    issued_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice Items
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    fee_structure_id UUID REFERENCES fee_structures(id),
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'paystack', 'mpesa', 'cheque', 'other')),
    transaction_ref TEXT,
    gateway_response JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Gateways
CREATE TABLE payment_gateways (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    gateway_name TEXT NOT NULL CHECK (gateway_name IN ('paystack', 'mpesa', 'stripe', 'flutterwave')),
    api_key TEXT,
    secret_key TEXT,
    is_active BOOLEAN DEFAULT true,
    config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Reconciliations
CREATE TABLE payment_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'unmatched', 'exception')),
    matched_invoice_id UUID REFERENCES invoices(id),
    notes TEXT,
    reconciled_by UUID REFERENCES employees(id),
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exams
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    exam_type TEXT NOT NULL CHECK (exam_type IN ('midterm', 'final', 'continuous_assessment', 'quiz', 'assignment')),
    weight NUMERIC(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exam Sessions
CREATE TABLE exam_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    exam_date DATE,
    start_time TIME,
    end_time TIME,
    max_marks NUMERIC(6, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exam Results
CREATE TABLE exam_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    marks_obtained NUMERIC(6, 2),
    grade TEXT,
    remarks TEXT,
    entered_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exam_session_id, student_id)
);

-- Grade Scales
CREATE TABLE grade_scales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scale_data JSONB NOT NULL, -- { "A": { "min": 80, "max": 100 }, ... }
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id),
    recipient_id UUID REFERENCES auth.users(id),
    recipient_type TEXT CHECK (recipient_type IN ('user', 'class', 'parent', 'student')),
    subject TEXT,
    body TEXT NOT NULL,
    message_type TEXT DEFAULT 'general' CHECK (message_type IN ('general', 'announcement', 'alert', 'payment_reminder')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message Templates
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_text TEXT NOT NULL,
    template_type TEXT,
    variables JSONB, -- List of variables that can be replaced
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp Sessions (Magic Links)
CREATE TABLE whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    phone_number TEXT,
    token TEXT UNIQUE NOT NULL,
    purpose TEXT NOT NULL, -- 'invoice_payment', 'permission_slip', etc.
    reference_id UUID, -- Links to invoice, application, etc.
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Logs
CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES auth.users(id),
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email', 'push')),
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    external_id TEXT, -- Gateway message ID
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strategic Layer Tables

-- Financial Forecasts
CREATE TABLE financial_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    forecast_date DATE NOT NULL,
    current_balance NUMERIC(12, 2) NOT NULL,
    monthly_income NUMERIC(12, 2) NOT NULL,
    monthly_expenses NUMERIC(12, 2) NOT NULL,
    runway_months NUMERIC(5, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, forecast_date)
);

-- Unit Profitability
CREATE TABLE unit_profitability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    unit_type TEXT NOT NULL CHECK (unit_type IN ('class', 'grade', 'department', 'transport', 'kitchen', 'hostel')),
    unit_id UUID, -- References class_id, department name, etc.
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    costs NUMERIC(12, 2) NOT NULL DEFAULT 0,
    profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    profit_margin NUMERIC(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff Metrics
CREATE TABLE staff_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    last_grade_entry TIMESTAMPTZ,
    days_since_last_grade INTEGER,
    leave_requests_count INTEGER DEFAULT 0,
    login_frequency INTEGER DEFAULT 0,
    attendance_delay_hours NUMERIC(5, 2),
    burnout_risk_score NUMERIC(5, 2), -- 0-100
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, metric_date)
);

-- Audit Anomalies
CREATE TABLE audit_anomalies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('inventory_usage', 'fuel_consumption', 'attendance_mismatch', 'payment_discrepancy')),
    description TEXT NOT NULL,
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    reference_data JSONB,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES employees(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_students_school_id ON students(school_id);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX idx_enrollments_academic_year_id ON enrollments(academic_year_id);
CREATE INDEX idx_attendance_records_student_date ON attendance_records(student_id, date);
CREATE INDEX idx_attendance_records_school_date ON attendance_records(school_id, date);
CREATE INDEX idx_invoices_student_id ON invoices(student_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_exam_results_student_id ON exam_results(student_id);
CREATE INDEX idx_user_schools_user_id ON user_schools(user_id);
CREATE INDEX idx_user_schools_school_id ON user_schools(school_id);
CREATE INDEX idx_whatsapp_sessions_token ON whatsapp_sessions(token);
CREATE INDEX idx_whatsapp_sessions_expires_at ON whatsapp_sessions(expires_at);

