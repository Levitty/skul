-- ============================================================================
-- TUTA SCHOOL - ALL PENDING MIGRATIONS
-- ============================================================================
-- Paste this entire script into Supabase SQL Editor and click "Run"
-- This creates the missing tables and adds new features
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS throughout)
-- ============================================================================


-- ============================================================================
-- MIGRATION 010: Finance & Accounting Module
-- Creates: chart_of_accounts, general_ledger, other_income, expense_categories,
--          expenses, expense_payments, budgets, accounts_payable, bank_accounts,
--          bank_transactions + GL trigger functions + RLS policies
-- ============================================================================

-- 1. CHART OF ACCOUNTS
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    account_code VARCHAR(20) NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN (
        'asset', 'liability', 'equity', 'revenue', 'expense'
    )),
    parent_account_id UUID REFERENCES chart_of_accounts(id),
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, account_code)
);

-- 2. GENERAL LEDGER
CREATE TABLE IF NOT EXISTS general_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    transaction_date DATE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'fee_invoice', 'fee_payment', 'expense', 'adjustment', 'transfer',
        'other_income', 'refund'
    )),
    reference_id UUID,
    reference_type TEXT,
    description TEXT NOT NULL,
    debit_amount NUMERIC(12, 2) DEFAULT 0,
    credit_amount NUMERIC(12, 2) DEFAULT 0,
    balance NUMERIC(12, 2) NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_school_account_date ON general_ledger(school_id, account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_gl_reference ON general_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_gl_transaction_date ON general_ledger(transaction_date);

-- 3. OTHER INCOME
CREATE TABLE IF NOT EXISTS other_income (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    income_type TEXT NOT NULL CHECK (income_type IN (
        'uniform_sale', 'trip_payment', 'club_fee', 'donation',
        'sponsorship', 'miscellaneous'
    )),
    student_id UUID REFERENCES students(id),
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_method TEXT CHECK (payment_method IN (
        'cash', 'bank_transfer', 'paystack', 'mpesa', 'cheque', 'other'
    )),
    transaction_ref TEXT,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    account_id UUID REFERENCES chart_of_accounts(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_other_income_school_date ON other_income(school_id, received_date);
CREATE INDEX IF NOT EXISTS idx_other_income_type ON other_income(income_type);

-- 4. EXPENSE CATEGORIES
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code VARCHAR(20),
    account_id UUID REFERENCES chart_of_accounts(id),
    parent_category_id UUID REFERENCES expense_categories(id),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_school ON expense_categories(school_id);

-- 5. EXPENSES
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    account_id UUID REFERENCES chart_of_accounts(id),
    vendor_name TEXT,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT CHECK (payment_method IN (
        'cash', 'bank_transfer', 'cheque', 'mpesa', 'other'
    )),
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN (
        'unpaid', 'partial', 'paid'
    )),
    invoice_number TEXT,
    receipt_url TEXT,
    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_school_date ON expenses(school_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(payment_status);

-- 6. EXPENSE PAYMENTS
CREATE TABLE IF NOT EXISTS expense_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    payment_method TEXT NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_ref TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_payments_expense ON expense_payments(expense_id);

-- 7. BUDGETS
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID REFERENCES academic_years(id),
    budget_name TEXT NOT NULL,
    budget_type TEXT NOT NULL CHECK (budget_type IN ('revenue', 'expense')),
    account_id UUID REFERENCES chart_of_accounts(id),
    category_id UUID REFERENCES expense_categories(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    budgeted_amount NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_school_period ON budgets(school_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_budgets_type ON budgets(budget_type);

-- 8. ACCOUNTS PAYABLE
CREATE TABLE IF NOT EXISTS accounts_payable (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    vendor_name TEXT NOT NULL,
    invoice_number TEXT,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue')),
    expense_id UUID REFERENCES expenses(id),
    paid_amount NUMERIC(12, 2) DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ap_school_status ON accounts_payable(school_id, status);
CREATE INDEX IF NOT EXISTS idx_ap_due_date ON accounts_payable(due_date);

-- 9. BANK ACCOUNTS
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_type TEXT CHECK (account_type IN ('checking', 'savings', 'mpesa', 'paystack')),
    opening_balance NUMERIC(12, 2) DEFAULT 0,
    current_balance NUMERIC(12, 2) DEFAULT 0,
    account_id UUID REFERENCES chart_of_accounts(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_school ON bank_accounts(school_id);

-- 10. BANK TRANSACTIONS
CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'fee')),
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2),
    reference_number TEXT,
    is_reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    matched_payment_id UUID REFERENCES payments(id),
    matched_expense_id UUID REFERENCES expenses(id),
    matched_other_income_id UUID REFERENCES other_income(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date ON bank_transactions(bank_account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(is_reconciled);

-- 11. ADD COLUMNS TO EXISTING TABLES
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

-- 12. GL FUNCTIONS
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id UUID, p_school_id UUID)
RETURNS NUMERIC(12, 2) AS $$
DECLARE
    v_balance NUMERIC(12, 2);
BEGIN
    SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_balance
    FROM general_ledger
    WHERE account_id = p_account_id AND school_id = p_school_id;
    RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_gl_entry(
    p_school_id UUID, p_account_id UUID, p_transaction_date DATE,
    p_transaction_type TEXT, p_reference_id UUID, p_reference_type TEXT,
    p_description TEXT, p_debit_amount NUMERIC(12, 2), p_credit_amount NUMERIC(12, 2),
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_gl_id UUID;
    v_balance NUMERIC(12, 2);
BEGIN
    v_balance := get_account_balance(p_account_id, p_school_id) + p_debit_amount - p_credit_amount;
    INSERT INTO general_ledger (
        school_id, account_id, transaction_date, transaction_type,
        reference_id, reference_type, description,
        debit_amount, credit_amount, balance, created_by
    ) VALUES (
        p_school_id, p_account_id, p_transaction_date, p_transaction_type,
        p_reference_id, p_reference_type, p_description,
        p_debit_amount, p_credit_amount, v_balance, p_created_by
    ) RETURNING id INTO v_gl_id;
    RETURN v_gl_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_fee_revenue_account(p_school_id UUID, p_fee_type TEXT)
RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
    v_account_code VARCHAR(20);
BEGIN
    CASE p_fee_type
        WHEN 'tuition' THEN v_account_code := '4000';
        WHEN 'exam' THEN v_account_code := '4100';
        WHEN 'transport' THEN v_account_code := '4200';
        WHEN 'hostel' THEN v_account_code := '4300';
        WHEN 'library' THEN v_account_code := '4400';
        ELSE v_account_code := '4500';
    END CASE;
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE school_id = p_school_id AND account_code = v_account_code
    LIMIT 1;
    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- Invoice GL trigger
CREATE OR REPLACE FUNCTION trigger_invoice_gl_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_fee_type TEXT;
BEGIN
    SELECT id INTO v_ar_account_id FROM chart_of_accounts
    WHERE school_id = NEW.school_id AND account_code = '1200' LIMIT 1;
    SELECT fs.fee_type INTO v_fee_type FROM invoice_items ii
    JOIN fee_structures fs ON ii.fee_structure_id = fs.id
    WHERE ii.invoice_id = NEW.id LIMIT 1;
    IF v_fee_type IS NULL THEN v_fee_type := 'tuition'; END IF;
    v_revenue_account_id := get_fee_revenue_account(NEW.school_id, v_fee_type);
    IF v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
        PERFORM create_gl_entry(NEW.school_id, v_ar_account_id, NEW.issued_date::DATE,
            'fee_invoice', NEW.id, 'invoice',
            'Invoice ' || NEW.reference || ' - ' || COALESCE(v_fee_type, 'tuition') || ' fees',
            NEW.amount, 0, NULL);
        PERFORM create_gl_entry(NEW.school_id, v_revenue_account_id, NEW.issued_date::DATE,
            'fee_invoice', NEW.id, 'invoice',
            'Invoice ' || NEW.reference || ' - ' || COALESCE(v_fee_type, 'tuition') || ' fees',
            0, NEW.amount, NULL);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_invoice_gl_entry ON invoices;
CREATE TRIGGER trigger_invoice_gl_entry
    AFTER INSERT ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION trigger_invoice_gl_entry();

-- Payment GL trigger
CREATE OR REPLACE FUNCTION trigger_payment_gl_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_cash_account_id UUID;
    v_bank_account_id UUID;
    v_ar_account_id UUID;
    v_account_id UUID;
BEGIN
    IF NEW.status != 'completed' THEN RETURN NEW; END IF;
    SELECT id INTO v_ar_account_id FROM chart_of_accounts
    WHERE school_id = NEW.school_id AND account_code = '1200' LIMIT 1;
    IF NEW.method IN ('mpesa', 'paystack') THEN
        IF NEW.bank_account_id IS NOT NULL THEN
            SELECT account_id INTO v_bank_account_id FROM bank_accounts WHERE id = NEW.bank_account_id;
        ELSE
            SELECT id INTO v_bank_account_id FROM chart_of_accounts
            WHERE school_id = NEW.school_id AND account_code = '1100' LIMIT 1;
        END IF;
        v_account_id := v_bank_account_id;
    ELSE
        SELECT id INTO v_cash_account_id FROM chart_of_accounts
        WHERE school_id = NEW.school_id AND account_code = '1000' LIMIT 1;
        v_account_id := v_cash_account_id;
    END IF;
    IF v_account_id IS NOT NULL AND v_ar_account_id IS NOT NULL THEN
        PERFORM create_gl_entry(NEW.school_id, v_account_id, COALESCE(NEW.paid_at::DATE, CURRENT_DATE),
            'fee_payment', NEW.id, 'payment',
            'Payment for invoice - ' || NEW.method, NEW.amount, 0, NULL);
        PERFORM create_gl_entry(NEW.school_id, v_ar_account_id, COALESCE(NEW.paid_at::DATE, CURRENT_DATE),
            'fee_payment', NEW.id, 'payment',
            'Payment for invoice - ' || NEW.method, 0, NEW.amount, NULL);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_gl_entry ON payments;
CREATE TRIGGER trigger_payment_gl_entry
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION trigger_payment_gl_entry();

-- 13. ROW LEVEL SECURITY
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE other_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop first to avoid duplicates)
DROP POLICY IF EXISTS "Users can access chart of accounts of their school" ON chart_of_accounts;
CREATE POLICY "Users can access chart of accounts of their school" ON chart_of_accounts FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access general ledger of their school" ON general_ledger;
CREATE POLICY "Users can access general ledger of their school" ON general_ledger FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access other income of their school" ON other_income;
CREATE POLICY "Users can access other income of their school" ON other_income FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access expense categories of their school" ON expense_categories;
CREATE POLICY "Users can access expense categories of their school" ON expense_categories FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access expenses of their school" ON expenses;
CREATE POLICY "Users can access expenses of their school" ON expenses FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access expense payments of their school" ON expense_payments;
CREATE POLICY "Users can access expense payments of their school" ON expense_payments FOR ALL
USING (EXISTS (SELECT 1 FROM expenses e WHERE e.id = expense_payments.expense_id AND e.school_id = get_user_school_id()));

DROP POLICY IF EXISTS "Users can access budgets of their school" ON budgets;
CREATE POLICY "Users can access budgets of their school" ON budgets FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access accounts payable of their school" ON accounts_payable;
CREATE POLICY "Users can access accounts payable of their school" ON accounts_payable FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access bank accounts of their school" ON bank_accounts;
CREATE POLICY "Users can access bank accounts of their school" ON bank_accounts FOR ALL USING (school_id = get_user_school_id());

DROP POLICY IF EXISTS "Users can access bank transactions of their school" ON bank_transactions;
CREATE POLICY "Users can access bank transactions of their school" ON bank_transactions FOR ALL
USING (EXISTS (SELECT 1 FROM bank_accounts ba WHERE ba.id = bank_transactions.bank_account_id AND ba.school_id = get_user_school_id()));

-- 14. SEED DEFAULT CHART OF ACCOUNTS FUNCTION
CREATE OR REPLACE FUNCTION seed_default_chart_of_accounts(p_school_id UUID)
RETURNS VOID AS $$
DECLARE
    v_asset_parent UUID;
    v_liability_parent UUID;
    v_equity_parent UUID;
    v_revenue_parent UUID;
    v_expense_parent UUID;
BEGIN
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '1000', 'Cash', 'asset', true)
    RETURNING id INTO v_asset_parent;
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active) VALUES
        (p_school_id, '1100', 'Bank Accounts', 'asset', v_asset_parent, true),
        (p_school_id, '1200', 'Accounts Receivable', 'asset', v_asset_parent, true),
        (p_school_id, '1300', 'Inventory', 'asset', v_asset_parent, true);
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '2000', 'Accounts Payable', 'liability', true)
    RETURNING id INTO v_liability_parent;
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES (p_school_id, '2100', 'Accrued Expenses', 'liability', v_liability_parent, true);
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '3000', 'Capital', 'equity', true)
    RETURNING id INTO v_equity_parent;
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES (p_school_id, '3100', 'Retained Earnings', 'equity', v_equity_parent, true);
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '4000', 'Tuition Fees', 'revenue', true)
    RETURNING id INTO v_revenue_parent;
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active) VALUES
        (p_school_id, '4100', 'Exam Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4200', 'Transport Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4300', 'Hostel/Boarding Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4400', 'Library Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4500', 'Other Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4600', 'Uniform Sales', 'revenue', v_revenue_parent, true),
        (p_school_id, '4700', 'Trip Payments', 'revenue', v_revenue_parent, true),
        (p_school_id, '4800', 'Club Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4900', 'Other Income', 'revenue', v_revenue_parent, true);
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '5100', 'Salaries & Wages', 'expense', true)
    RETURNING id INTO v_expense_parent;
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active) VALUES
        (p_school_id, '5200', 'Utilities', 'expense', v_expense_parent, true),
        (p_school_id, '5300', 'Supplies & Materials', 'expense', v_expense_parent, true),
        (p_school_id, '5400', 'Maintenance', 'expense', v_expense_parent, true),
        (p_school_id, '5500', 'Administration', 'expense', v_expense_parent, true),
        (p_school_id, '5600', 'Other Expenses', 'expense', v_expense_parent, true);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- MIGRATION 022: Expense Approvals
-- ============================================================================

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status TEXT
CHECK (approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS expense_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    approver_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
    comments TEXT,
    approved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_approvals_expense ON expense_approvals(expense_id);


-- ============================================================================
-- MIGRATION 034: Enhance Applications Table
-- ============================================================================

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS medical_notes TEXT,
ADD COLUMN IF NOT EXISTS previous_school_name TEXT,
ADD COLUMN IF NOT EXISTS previous_school_address TEXT,
ADD COLUMN IF NOT EXISTS previous_school_class TEXT,
ADD COLUMN IF NOT EXISTS previous_school_passout_year INTEGER;

CREATE INDEX IF NOT EXISTS idx_applications_school_id ON applications(school_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_class_id ON applications(applied_class_id);


-- ============================================================================
-- MIGRATION 035: Credit Notes Enhancements
-- ============================================================================

ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'applied', 'voided'));
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_issued_at ON credit_notes(issued_at);


-- ============================================================================
-- MIGRATION 036: Expand Other Income Types
-- ============================================================================

ALTER TABLE IF EXISTS other_income DROP CONSTRAINT IF EXISTS other_income_income_type_check;

ALTER TABLE other_income ADD CONSTRAINT other_income_income_type_check CHECK (income_type IN (
    'uniform_sale', 'trip_payment', 'club_fee', 'donation',
    'sponsorship', 'book_sales', 'event_revenue', 'rental_income',
    'interest_income', 'government_grant', 'miscellaneous'
));

CREATE INDEX IF NOT EXISTS idx_other_income_type_amount ON other_income(income_type, amount DESC);


-- ============================================================================
-- SEED DATA: Create default Chart of Accounts for your school
-- ============================================================================

-- This creates all the default accounts (Cash, Bank, AR, Revenue, Expense accounts)
-- Replace the school ID below with your actual school ID if different
DO $$
DECLARE
    v_school_id UUID;
    v_has_accounts BOOLEAN;
BEGIN
    -- Get the first school (yours)
    SELECT id INTO v_school_id FROM schools LIMIT 1;

    -- Only seed if no accounts exist yet
    SELECT EXISTS(SELECT 1 FROM chart_of_accounts WHERE school_id = v_school_id) INTO v_has_accounts;

    IF NOT v_has_accounts AND v_school_id IS NOT NULL THEN
        PERFORM seed_default_chart_of_accounts(v_school_id);
        RAISE NOTICE 'Default chart of accounts created for school %', v_school_id;
    ELSE
        RAISE NOTICE 'Chart of accounts already exists or no school found. Skipping seed.';
    END IF;
END;
$$;


-- ============================================================================
-- SEED DATA: Create default Expense Categories
-- ============================================================================

DO $$
DECLARE
    v_school_id UUID;
    v_has_categories BOOLEAN;
BEGIN
    SELECT id INTO v_school_id FROM schools LIMIT 1;
    SELECT EXISTS(SELECT 1 FROM expense_categories WHERE school_id = v_school_id) INTO v_has_categories;

    IF NOT v_has_categories AND v_school_id IS NOT NULL THEN
        INSERT INTO expense_categories (school_id, name, code, description, is_active) VALUES
            (v_school_id, 'Salaries & Wages', 'SAL', 'Staff salaries and wages', true),
            (v_school_id, 'Utilities', 'UTL', 'Electricity, water, internet', true),
            (v_school_id, 'Supplies & Materials', 'SUP', 'Teaching and office supplies', true),
            (v_school_id, 'Maintenance & Repairs', 'MNT', 'Building and equipment maintenance', true),
            (v_school_id, 'Transport', 'TRN', 'Vehicle fuel and maintenance', true),
            (v_school_id, 'Food & Catering', 'FNC', 'Student meals and catering', true),
            (v_school_id, 'Insurance', 'INS', 'School and staff insurance', true),
            (v_school_id, 'Marketing & Advertising', 'MKT', 'Marketing and promotion', true),
            (v_school_id, 'Professional Services', 'PRF', 'Legal, accounting, consulting', true),
            (v_school_id, 'Other', 'OTH', 'Miscellaneous expenses', true);
        RAISE NOTICE 'Default expense categories created';
    ELSE
        RAISE NOTICE 'Expense categories already exist or no school found. Skipping seed.';
    END IF;
END;
$$;


-- ============================================================================
-- CLEANUP: Remove duplicate student records (3 orphan Mikaela Amani entries)
-- ============================================================================

-- This safely removes duplicate students that have no enrollment, no email,
-- and no admission number (orphaned from failed enrollment attempts)
-- It keeps the FIRST one (oldest) if there are duplicates
DO $$
DECLARE
    v_deleted INT := 0;
BEGIN
    DELETE FROM students
    WHERE id IN (
        SELECT s.id FROM students s
        WHERE s.first_name = 'Mikaela' AND s.last_name = 'Amani'
        AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id)
        AND s.admission_number IS NULL
        ORDER BY s.created_at ASC
        OFFSET 1 -- Keep the first one, delete the rest
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Cleaned up % duplicate student records', v_deleted;
END;
$$;


-- ============================================================================
-- DONE! All migrations applied successfully.
-- ============================================================================
-- Refresh your browser to see expenses working, and the other new features.
