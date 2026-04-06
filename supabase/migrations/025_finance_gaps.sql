-- =============================================
-- 025: Finance Gaps — Discounts, Credit Notes,
--      Vouchers, Journal Entries, Suppliers,
--      Votehead flags
-- =============================================

-- 1. Credit Notes table
CREATE TABLE IF NOT EXISTS credit_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    credit_number TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    issued_by UUID REFERENCES auth.users(id),
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_school ON credit_notes(school_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_student ON credit_notes(student_id);

-- 2. Add discount columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_reason TEXT;

-- 3. Add mandatory/optional votehead flag to fee_structures
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT true;

-- 4. Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_id TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_school ON suppliers(school_id);

-- Add supplier_id FK to expenses (nullable, for linking)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

-- Add supplier_id FK to accounts_payable (nullable)
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

-- 5. Journal entries table for manual entries
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    entry_number TEXT NOT NULL,
    description TEXT NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    debit_amount NUMERIC(12, 2) DEFAULT 0,
    credit_amount NUMERIC(12, 2) DEFAULT 0,
    description TEXT,
    CHECK (debit_amount >= 0 AND credit_amount >= 0),
    CHECK (debit_amount > 0 OR credit_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_school ON journal_entries(school_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);

-- 6. RLS policies
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_notes_school_access" ON credit_notes
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "suppliers_school_access" ON suppliers
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "journal_entries_school_access" ON journal_entries
    FOR ALL USING (
        school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid())
    );

CREATE POLICY "journal_entry_lines_access" ON journal_entry_lines
    FOR ALL USING (
        journal_entry_id IN (SELECT id FROM journal_entries WHERE school_id IN (SELECT school_id FROM user_schools WHERE user_id = auth.uid()))
    );
