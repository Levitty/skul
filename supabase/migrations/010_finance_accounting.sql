-- Migration: Comprehensive Finance & Accounting Module
-- This migration adds chart of accounts, general ledger, expense tracking,
-- budget management, accounts payable, bank accounts, and other income tracking
-- Fees are PRIMARY revenue source, other income is secondary

-- ============================================================================
-- 1. CHART OF ACCOUNTS
-- ============================================================================
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

-- ============================================================================
-- 2. GENERAL LEDGER
-- ============================================================================
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
    reference_type TEXT, -- 'invoice', 'payment', 'expense', 'other_income'
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

-- ============================================================================
-- 3. OTHER INCOME (SECONDARY REVENUE)
-- ============================================================================
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
    account_id UUID REFERENCES chart_of_accounts(id), -- Revenue account (4600-4900)
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_other_income_school_date ON other_income(school_id, received_date);
CREATE INDEX IF NOT EXISTS idx_other_income_type ON other_income(income_type);

-- ============================================================================
-- 4. EXPENSE CATEGORIES
-- ============================================================================
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

-- ============================================================================
-- 5. EXPENSES
-- ============================================================================
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
    invoice_number TEXT, -- Vendor invoice number
    receipt_url TEXT, -- Link to uploaded receipt
    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_school_date ON expenses(school_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(payment_status);

-- ============================================================================
-- 6. EXPENSE PAYMENTS (for partial payments)
-- ============================================================================
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

-- ============================================================================
-- 7. BUDGETS
-- ============================================================================
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

-- ============================================================================
-- 8. ACCOUNTS PAYABLE
-- ============================================================================
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

-- ============================================================================
-- 9. BANK ACCOUNTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_type TEXT CHECK (account_type IN ('checking', 'savings', 'mpesa', 'paystack')),
    opening_balance NUMERIC(12, 2) DEFAULT 0,
    current_balance NUMERIC(12, 2) DEFAULT 0,
    account_id UUID REFERENCES chart_of_accounts(id), -- Asset account
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_school ON bank_accounts(school_id);

-- ============================================================================
-- 10. BANK TRANSACTIONS (for reconciliation)
-- ============================================================================
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

-- ============================================================================
-- 11. UPDATE EXISTING TABLES
-- ============================================================================

-- Add account_id to invoices (Accounts Receivable account)
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id);

-- Add bank_account_id to payments (for bank reconciliation)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

-- ============================================================================
-- 12. FUNCTIONS FOR AUTO-GENERATING GL ENTRIES
-- ============================================================================

-- Function to get account balance
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

-- Function to create GL entry
CREATE OR REPLACE FUNCTION create_gl_entry(
    p_school_id UUID,
    p_account_id UUID,
    p_transaction_date DATE,
    p_transaction_type TEXT,
    p_reference_id UUID,
    p_reference_type TEXT,
    p_description TEXT,
    p_debit_amount NUMERIC(12, 2),
    p_credit_amount NUMERIC(12, 2),
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_gl_id UUID;
    v_balance NUMERIC(12, 2);
BEGIN
    -- Calculate balance
    v_balance := get_account_balance(p_account_id, p_school_id) + p_debit_amount - p_credit_amount;
    
    -- Insert GL entry
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

-- Function to get revenue account for fee type
CREATE OR REPLACE FUNCTION get_fee_revenue_account(p_school_id UUID, p_fee_type TEXT)
RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
    v_account_code VARCHAR(20);
BEGIN
    -- Map fee types to account codes
    CASE p_fee_type
        WHEN 'tuition' THEN v_account_code := '4000';
        WHEN 'exam' THEN v_account_code := '4100';
        WHEN 'transport' THEN v_account_code := '4200';
        WHEN 'hostel' THEN v_account_code := '4300';
        WHEN 'library' THEN v_account_code := '4400';
        ELSE v_account_code := '4500'; -- Other Fees
    END CASE;
    
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE school_id = p_school_id AND account_code = v_account_code
    LIMIT 1;
    
    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to create GL entry when invoice is created
CREATE OR REPLACE FUNCTION trigger_invoice_gl_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_fee_type TEXT;
BEGIN
    -- Get Accounts Receivable account (1200)
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE school_id = NEW.school_id AND account_code = '1200'
    LIMIT 1;
    
    -- Get fee type from invoice items (use first item's fee_structure)
    SELECT fs.fee_type INTO v_fee_type
    FROM invoice_items ii
    JOIN fee_structures fs ON ii.fee_structure_id = fs.id
    WHERE ii.invoice_id = NEW.id
    LIMIT 1;
    
    -- Default to tuition if no fee type found
    IF v_fee_type IS NULL THEN
        v_fee_type := 'tuition';
    END IF;
    
    -- Get revenue account
    v_revenue_account_id := get_fee_revenue_account(NEW.school_id, v_fee_type);
    
    -- Create GL entries if accounts exist
    IF v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
        -- DR Accounts Receivable
        PERFORM create_gl_entry(
            NEW.school_id, v_ar_account_id, NEW.issued_date::DATE,
            'fee_invoice', NEW.id, 'invoice',
            'Invoice ' || NEW.reference || ' - ' || COALESCE(v_fee_type, 'tuition') || ' fees',
            NEW.amount, 0, NULL
        );
        
        -- CR Revenue
        PERFORM create_gl_entry(
            NEW.school_id, v_revenue_account_id, NEW.issued_date::DATE,
            'fee_invoice', NEW.id, 'invoice',
            'Invoice ' || NEW.reference || ' - ' || COALESCE(v_fee_type, 'tuition') || ' fees',
            0, NEW.amount, NULL
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for invoice GL entry
DROP TRIGGER IF EXISTS trigger_invoice_gl_entry ON invoices;
CREATE TRIGGER trigger_invoice_gl_entry
    AFTER INSERT ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION trigger_invoice_gl_entry();

-- Trigger function to create GL entry when payment is received
CREATE OR REPLACE FUNCTION trigger_payment_gl_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_cash_account_id UUID;
    v_bank_account_id UUID;
    v_ar_account_id UUID;
    v_account_id UUID;
BEGIN
    -- Only process completed payments
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;
    
    -- Get Accounts Receivable account (1200)
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE school_id = NEW.school_id AND account_code = '1200'
    LIMIT 1;
    
    -- Determine cash/bank account based on payment method
    IF NEW.method IN ('mpesa', 'paystack') THEN
        -- Use bank account if specified, otherwise default bank account
        IF NEW.bank_account_id IS NOT NULL THEN
            SELECT account_id INTO v_bank_account_id
            FROM bank_accounts
            WHERE id = NEW.bank_account_id;
        ELSE
            SELECT id INTO v_bank_account_id
            FROM chart_of_accounts
            WHERE school_id = NEW.school_id AND account_code = '1100'
            LIMIT 1;
        END IF;
        v_account_id := v_bank_account_id;
    ELSE
        -- Cash account (1000)
        SELECT id INTO v_cash_account_id
        FROM chart_of_accounts
        WHERE school_id = NEW.school_id AND account_code = '1000'
        LIMIT 1;
        v_account_id := v_cash_account_id;
    END IF;
    
    -- Create GL entries if accounts exist
    IF v_account_id IS NOT NULL AND v_ar_account_id IS NOT NULL THEN
        -- DR Cash/Bank
        PERFORM create_gl_entry(
            NEW.school_id, v_account_id, COALESCE(NEW.paid_at::DATE, CURRENT_DATE),
            'fee_payment', NEW.id, 'payment',
            'Payment for invoice - ' || NEW.method,
            NEW.amount, 0, NULL
        );
        
        -- CR Accounts Receivable
        PERFORM create_gl_entry(
            NEW.school_id, v_ar_account_id, COALESCE(NEW.paid_at::DATE, CURRENT_DATE),
            'fee_payment', NEW.id, 'payment',
            'Payment for invoice - ' || NEW.method,
            0, NEW.amount, NULL
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment GL entry
DROP TRIGGER IF EXISTS trigger_payment_gl_entry ON payments;
CREATE TRIGGER trigger_payment_gl_entry
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION trigger_payment_gl_entry();

-- ============================================================================
-- 13. ROW LEVEL SECURITY POLICIES
-- ============================================================================

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

-- Chart of Accounts policies
CREATE POLICY "Users can access chart of accounts of their school"
    ON chart_of_accounts FOR ALL
    USING (school_id = get_user_school_id());

-- General Ledger policies
CREATE POLICY "Users can access general ledger of their school"
    ON general_ledger FOR ALL
    USING (school_id = get_user_school_id());

-- Other Income policies
CREATE POLICY "Users can access other income of their school"
    ON other_income FOR ALL
    USING (school_id = get_user_school_id());

-- Expense Categories policies
CREATE POLICY "Users can access expense categories of their school"
    ON expense_categories FOR ALL
    USING (school_id = get_user_school_id());

-- Expenses policies
CREATE POLICY "Users can access expenses of their school"
    ON expenses FOR ALL
    USING (school_id = get_user_school_id());

-- Expense Payments policies
CREATE POLICY "Users can access expense payments of their school"
    ON expense_payments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM expenses e
            WHERE e.id = expense_payments.expense_id
            AND e.school_id = get_user_school_id()
        )
    );

-- Budgets policies
CREATE POLICY "Users can access budgets of their school"
    ON budgets FOR ALL
    USING (school_id = get_user_school_id());

-- Accounts Payable policies
CREATE POLICY "Users can access accounts payable of their school"
    ON accounts_payable FOR ALL
    USING (school_id = get_user_school_id());

-- Bank Accounts policies
CREATE POLICY "Users can access bank accounts of their school"
    ON bank_accounts FOR ALL
    USING (school_id = get_user_school_id());

-- Bank Transactions policies
CREATE POLICY "Users can access bank transactions of their school"
    ON bank_transactions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM bank_accounts ba
            WHERE ba.id = bank_transactions.bank_account_id
            AND ba.school_id = get_user_school_id()
        )
    );

-- ============================================================================
-- 14. FUNCTION TO SEED DEFAULT CHART OF ACCOUNTS
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_default_chart_of_accounts(p_school_id UUID)
RETURNS VOID AS $$
DECLARE
    v_asset_parent UUID;
    v_liability_parent UUID;
    v_equity_parent UUID;
    v_revenue_parent UUID;
    v_expense_parent UUID;
BEGIN
    -- Assets (1000-1999)
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '1000', 'Cash', 'asset', true)
    RETURNING id INTO v_asset_parent;
    
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES 
        (p_school_id, '1100', 'Bank Accounts', 'asset', v_asset_parent, true),
        (p_school_id, '1200', 'Accounts Receivable', 'asset', v_asset_parent, true),
        (p_school_id, '1300', 'Inventory', 'asset', v_asset_parent, true);
    
    -- Liabilities (2000-2999)
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '2000', 'Accounts Payable', 'liability', true)
    RETURNING id INTO v_liability_parent;
    
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES (p_school_id, '2100', 'Accrued Expenses', 'liability', v_liability_parent, true);
    
    -- Equity (3000-3999)
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '3000', 'Capital', 'equity', true)
    RETURNING id INTO v_equity_parent;
    
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES (p_school_id, '3100', 'Retained Earnings', 'equity', v_equity_parent, true);
    
    -- Revenue - FEES PRIMARY (4000-4999)
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '4000', 'Tuition Fees', 'revenue', true)
    RETURNING id INTO v_revenue_parent;
    
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES 
        (p_school_id, '4100', 'Exam Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4200', 'Transport Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4300', 'Hostel/Boarding Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4400', 'Library Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4500', 'Other Fees', 'revenue', v_revenue_parent, true),
        -- Secondary Revenue (4600-4900)
        (p_school_id, '4600', 'Uniform Sales', 'revenue', v_revenue_parent, true),
        (p_school_id, '4700', 'Trip Payments', 'revenue', v_revenue_parent, true),
        (p_school_id, '4800', 'Club Fees', 'revenue', v_revenue_parent, true),
        (p_school_id, '4900', 'Other Income', 'revenue', v_revenue_parent, true);
    
    -- Expenses (5000-5999)
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, is_active)
    VALUES (p_school_id, '5100', 'Salaries & Wages', 'expense', true)
    RETURNING id INTO v_expense_parent;
    
    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES 
        (p_school_id, '5200', 'Utilities', 'expense', v_expense_parent, true),
        (p_school_id, '5300', 'Supplies & Materials', 'expense', v_expense_parent, true),
        (p_school_id, '5400', 'Maintenance', 'expense', v_expense_parent, true),
        (p_school_id, '5500', 'Administration', 'expense', v_expense_parent, true),
        (p_school_id, '5600', 'Other Expenses', 'expense', v_expense_parent, true);
END;
$$ LANGUAGE plpgsql;

