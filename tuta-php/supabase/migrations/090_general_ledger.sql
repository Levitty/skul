-- ─────────────────────────────────────────────────────────────────
-- Migration 090: General Ledger (double-entry spine)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor, then Settings → API →
-- Reload Schema Cache.
--
-- Turns Tuta's cash-basis fees/expense tracker into real double-entry
-- accounting WITHOUT changing any existing screen. Every invoice,
-- payment, expense and income row automatically posts a balanced
-- journal to a per-school chart of accounts, via triggers. From the
-- ledger we can produce Trial Balance, Income & Expenditure and
-- Balance Sheet.
--
-- Design notes:
--   * Posting is in TRIGGERS, not PHP — so it can't be bypassed by any
--     write path (record_payment RPC, generate_invoices RPC, or a
--     direct insert) and it's atomic with the source row.
--   * Triggers NEVER abort the source transaction. If posting fails,
--     the error is logged to ledger_errors and the invoice/
--     payment still succeeds. Books can be repaired by re-running
--     backfill_ledger(); a live school is never blocked from taking a
--     payment by an accounting bug.
--   * post_journal() is idempotent per (source_type, source_id), so
--     triggers can't double-post and backfill_ledger() is safe to
--     re-run.
-- ─────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ledger_accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
    normal_side TEXT NOT NULL CHECK (normal_side IN ('debit','credit')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    is_system   BOOLEAN NOT NULL DEFAULT false,   -- seeded default; cannot be deleted
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, code)
);
CREATE INDEX IF NOT EXISTS idx_la_school ON ledger_accounts(school_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID NOT NULL,
    entry_date  DATE NOT NULL,
    memo        TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',   -- invoice|payment|expense|income|invoice_cancel|payroll|manual
    source_id   UUID,
    reversed_by UUID,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_le_date  ON ledger_entries(school_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_le_source       ON ledger_entries(school_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS ledger_lines (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id   UUID NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
    school_id  UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id),
    entry_date DATE NOT NULL,          -- denormalised from the entry for fast date-range reporting
    debit      NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit     NUMERIC(14,2) NOT NULL DEFAULT 0,
    memo       TEXT
);
CREATE INDEX IF NOT EXISTS idx_ll_entry   ON ledger_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_ll_account ON ledger_lines(school_id, account_id, entry_date);

CREATE TABLE IF NOT EXISTS ledger_periods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID NOT NULL,
    name       TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    closed_at  TIMESTAMPTZ,
    closed_by  UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS ledger_errors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID,
    source_type TEXT,
    source_id   UUID,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lerr_school ON ledger_errors(school_id, created_at);

-- Category → account mapping (nullable; NULL falls back to a default in the trigger).
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE income_categories  ADD COLUMN IF NOT EXISTS account_code TEXT;

-- ── RLS (service-role only, matching existing convention) ─────────
ALTER TABLE ledger_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_ledger_accounts"     ON ledger_accounts;
DROP POLICY IF EXISTS "srv_ledger_entries"       ON ledger_entries;
DROP POLICY IF EXISTS "srv_ledger_lines"         ON ledger_lines;
DROP POLICY IF EXISTS "srv_ledger_periods"    ON ledger_periods;
DROP POLICY IF EXISTS "srv_ledger_errors" ON ledger_errors;
CREATE POLICY "srv_ledger_accounts"     ON ledger_accounts     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srv_ledger_entries"       ON ledger_entries       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srv_ledger_lines"         ON ledger_lines         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srv_ledger_periods"    ON ledger_periods    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "srv_ledger_errors" ON ledger_errors FOR ALL USING (true) WITH CHECK (true);

-- ═════════════════════════════════════════════════════════════════
-- 2. DEFAULT CHART OF ACCOUNTS (seeded per school)
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION seed_ledger_accounts(p_school_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO ledger_accounts (school_id, code, name, type, normal_side, is_system) VALUES
        (p_school_id, '1000', 'Cash on hand',                     'asset',     'debit',  true),
        (p_school_id, '1010', 'Bank',                             'asset',     'debit',  true),
        (p_school_id, '1020', 'M-Pesa / Mobile Money',            'asset',     'debit',  true),
        (p_school_id, '1200', 'Fees Receivable',                  'asset',     'debit',  true),
        (p_school_id, '2000', 'Fees in Advance (student credit)', 'liability', 'credit', true),
        (p_school_id, '2100', 'Accounts Payable',                 'liability', 'credit', true),
        (p_school_id, '2200', 'Statutory Liabilities',            'liability', 'credit', true),
        (p_school_id, '3000', 'Accumulated Fund',                 'equity',    'credit', true),
        (p_school_id, '4000', 'Tuition & Fee Income',             'income',    'credit', true),
        (p_school_id, '4100', 'Other Income',                     'income',    'credit', true),
        (p_school_id, '4200', 'Uniform Sales',                    'income',    'credit', true),
        (p_school_id, '4900', 'Discounts & Concessions',          'income',    'debit',  true),
        (p_school_id, '5000', 'Salaries & Wages',                 'expense',   'debit',  true),
        (p_school_id, '5100', 'Rent',                             'expense',   'debit',  true),
        (p_school_id, '5200', 'Utilities',                        'expense',   'debit',  true),
        (p_school_id, '5300', 'Supplies & Materials',             'expense',   'debit',  true),
        (p_school_id, '5400', 'Meals & Catering',                 'expense',   'debit',  true),
        (p_school_id, '5900', 'General / Other Expenses',         'expense',   'debit',  true)
    ON CONFLICT (school_id, code) DO NOTHING;
END;
$fn$;

-- Seed a school only if it has no accounts yet (never clobbers customisations).
CREATE OR REPLACE FUNCTION ensure_chart_seeded(p_school_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $fn$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ledger_accounts WHERE school_id = p_school_id) THEN
        PERFORM seed_ledger_accounts(p_school_id);
    END IF;
END;
$fn$;

-- Resolve an account code → id for a school (raises if missing).
CREATE OR REPLACE FUNCTION coa_id(p_school_id UUID, p_code TEXT)
RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE v_id UUID;
BEGIN
    SELECT id INTO v_id FROM ledger_accounts
     WHERE school_id = p_school_id AND code = p_code LIMIT 1;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'No account % for school %', p_code, p_school_id;
    END IF;
    RETURN v_id;
END;
$fn$;

-- ═════════════════════════════════════════════════════════════════
-- 3. post_journal() — the one posting primitive
-- ═════════════════════════════════════════════════════════════════
-- p_lines: jsonb array of {"code":"1200","debit":100,"credit":0,"memo":"..."}
-- Asserts debits = credits. Idempotent per (source_type, source_id)
-- for non-manual sources. Returns the entry id (or existing/NULL).
CREATE OR REPLACE FUNCTION post_journal(
    p_school_id   UUID,
    p_date        DATE,
    p_memo        TEXT,
    p_source_type TEXT,
    p_source_id   UUID,
    p_lines       JSONB,
    p_created_by  UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v_entry_id   UUID;
    v_line       JSONB;
    v_tot_debit  NUMERIC(14,2) := 0;
    v_tot_credit NUMERIC(14,2) := 0;
BEGIN
    PERFORM ensure_chart_seeded(p_school_id);

    -- Idempotency: automatic sources post at most once per source row.
    IF p_source_type <> 'manual' AND p_source_id IS NOT NULL THEN
        SELECT id INTO v_entry_id FROM ledger_entries
         WHERE school_id = p_school_id AND source_type = p_source_type AND source_id = p_source_id
         LIMIT 1;
        IF v_entry_id IS NOT NULL THEN
            RETURN v_entry_id;   -- already posted
        END IF;
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_tot_debit  := v_tot_debit  + COALESCE((v_line->>'debit')::NUMERIC, 0);
        v_tot_credit := v_tot_credit + COALESCE((v_line->>'credit')::NUMERIC, 0);
    END LOOP;

    -- Nothing to post (e.g. a zero-value invoice) — not an error.
    IF v_tot_debit = 0 AND v_tot_credit = 0 THEN
        RETURN NULL;
    END IF;

    IF ABS(v_tot_debit - v_tot_credit) > 0.005 THEN
        RAISE EXCEPTION 'Unbalanced journal (% dr vs % cr) for % %',
            v_tot_debit, v_tot_credit, p_source_type, p_source_id;
    END IF;

    INSERT INTO ledger_entries (school_id, entry_date, memo, source_type, source_id, created_by)
    VALUES (p_school_id, COALESCE(p_date, CURRENT_DATE), p_memo, p_source_type, p_source_id, p_created_by)
    RETURNING id INTO v_entry_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO ledger_lines (entry_id, school_id, account_id, entry_date, debit, credit, memo)
        VALUES (
            v_entry_id, p_school_id,
            coa_id(p_school_id, v_line->>'code'),
            COALESCE(p_date, CURRENT_DATE),
            COALESCE((v_line->>'debit')::NUMERIC, 0),
            COALESCE((v_line->>'credit')::NUMERIC, 0),
            v_line->>'memo'
        );
    END LOOP;

    RETURN v_entry_id;
END;
$fn$;

-- Map a payment/expense method to a cash-side account code.
CREATE OR REPLACE FUNCTION cash_account_code(p_method TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
    SELECT CASE lower(COALESCE(p_method, ''))
        WHEN 'cash'           THEN '1000'
        WHEN 'mpesa'          THEN '1020'
        WHEN 'mobile_money'   THEN '1020'
        WHEN 'bank_transfer'  THEN '1010'
        WHEN 'cheque'         THEN '1010'
        WHEN 'card'           THEN '1010'
        WHEN 'bank'           THEN '1010'
        ELSE '1010'
    END;
$fn$;

-- ═════════════════════════════════════════════════════════════════
-- 4. TRIGGER FUNCTIONS  (each swallows errors → ledger_errors)
-- ═════════════════════════════════════════════════════════════════

-- ── Invoice: recognise revenue when it leaves 'draft'; reverse on cancel
CREATE OR REPLACE FUNCTION trg_post_invoice()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_recognise BOOLEAN := false;
    v_cancel    BOOLEAN := false;
    v_revenue   NUMERIC(14,2);
    v_credit    NUMERIC(14,2);
    v_date      DATE;
    v_lines     JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_recognise := (NEW.status IS DISTINCT FROM 'draft' AND NEW.status <> 'cancelled');
    ELSIF TG_OP = 'UPDATE' THEN
        -- draft → issued: recognise now
        IF OLD.status = 'draft' AND NEW.status <> 'draft' AND NEW.status <> 'cancelled' THEN
            v_recognise := true;
        END IF;
        -- issued → cancelled: reverse
        IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND OLD.status <> 'draft' THEN
            v_cancel := true;
        END IF;
    END IF;

    BEGIN
        IF v_recognise THEN
            -- Revenue = fresh fees only. Carried-forward balance already sits in
            -- Fees Receivable from the original invoice, so don't re-recognise it.
            v_revenue := GREATEST(0, COALESCE(NEW.amount,0) - COALESCE(NEW.carry_forward_amount,0));
            v_credit  := GREATEST(0, COALESCE(NEW.credit_applied,0));
            v_date    := COALESCE(NEW.issued_at::date, NEW.created_at::date, CURRENT_DATE);
            v_lines   := jsonb_build_array(
                jsonb_build_object('code','1200','debit',v_revenue,'credit',0,'memo','Fees receivable'),
                jsonb_build_object('code','4000','debit',0,'credit',v_revenue,'memo','Fee income')
            );
            IF v_credit > 0 THEN
                v_lines := v_lines
                    || jsonb_build_array(
                        jsonb_build_object('code','2000','debit',v_credit,'credit',0,'memo','Credit applied'),
                        jsonb_build_object('code','1200','debit',0,'credit',v_credit,'memo','Credit applied to fees'));
            END IF;
            PERFORM post_journal(NEW.school_id, v_date,
                'Invoice ' || COALESCE(NEW.reference,''), 'invoice', NEW.id, v_lines);

        ELSIF v_cancel THEN
            -- Reverse the unpaid receivable portion of the cancelled invoice.
            v_revenue := GREATEST(0, COALESCE(NEW.amount,0) - COALESCE(NEW.paid_amount,0)
                                     - COALESCE(NEW.carry_forward_amount,0));
            v_date    := CURRENT_DATE;
            v_lines   := jsonb_build_array(
                jsonb_build_object('code','4000','debit',v_revenue,'credit',0,'memo','Cancelled invoice reversal'),
                jsonb_build_object('code','1200','debit',0,'credit',v_revenue,'memo','Cancelled invoice reversal')
            );
            PERFORM post_journal(NEW.school_id, v_date,
                'Cancel invoice ' || COALESCE(NEW.reference,''), 'invoice_cancel', NEW.id, v_lines);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (NEW.school_id, 'invoice', NEW.id, SQLERRM);
    END;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ledger_invoice ON invoices;
CREATE TRIGGER trg_ledger_invoice
    AFTER INSERT OR UPDATE OF status ON invoices
    FOR EACH ROW EXECUTE FUNCTION trg_post_invoice();

-- ── Payment: cash in, reduce receivable, overpayment → student credit
CREATE OR REPLACE FUNCTION trg_post_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_inv_amount NUMERIC(14,2);
    v_inv_paid   NUMERIC(14,2);
    v_balance    NUMERIC(14,2);
    v_applied    NUMERIC(14,2);
    v_overpay    NUMERIC(14,2);
    v_cash       TEXT;
    v_date       DATE;
    v_lines      JSONB;
BEGIN
    BEGIN
        v_date := COALESCE(NEW.payment_date, NEW.paid_at::date, CURRENT_DATE);

        IF lower(COALESCE(NEW.method,'')) = 'credit_balance' THEN
            -- Paying from prepayment: draw down the liability, clear receivable.
            v_lines := jsonb_build_array(
                jsonb_build_object('code','2000','debit',NEW.amount,'credit',0,'memo','Paid from credit'),
                jsonb_build_object('code','1200','debit',0,'credit',NEW.amount,'memo','Fees receivable'));
        ELSE
            -- Read invoice balance BEFORE this payment is applied. record_payment
            -- inserts the payment row before it updates the invoice, so at AFTER
            -- INSERT time invoices.paid_amount is still pre-payment.
            SELECT amount, paid_amount INTO v_inv_amount, v_inv_paid
              FROM invoices WHERE id = NEW.invoice_id;
            v_balance := GREATEST(0, COALESCE(v_inv_amount,0) - COALESCE(v_inv_paid,0));
            v_applied := LEAST(NEW.amount, v_balance);
            v_overpay := GREATEST(0, NEW.amount - v_applied);
            v_cash    := cash_account_code(NEW.method);

            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_cash,'debit',NEW.amount,'credit',0,'memo','Payment received'));
            IF v_applied > 0 THEN
                v_lines := v_lines || jsonb_build_array(
                    jsonb_build_object('code','1200','debit',0,'credit',v_applied,'memo','Fees receivable'));
            END IF;
            IF v_overpay > 0 THEN
                v_lines := v_lines || jsonb_build_array(
                    jsonb_build_object('code','2000','debit',0,'credit',v_overpay,'memo','Overpayment → credit'));
            END IF;
        END IF;

        PERFORM post_journal(NEW.school_id, v_date,
            'Receipt ' || COALESCE(NEW.receipt_number, NEW.transaction_ref, ''),
            'payment', NEW.id, v_lines);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (NEW.school_id, 'payment', NEW.id, SQLERRM);
    END;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ledger_payment ON payments;
CREATE TRIGGER trg_ledger_payment
    AFTER INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION trg_post_payment();

-- ── Expense: expense account (by category) up, cash down
CREATE OR REPLACE FUNCTION trg_post_expense()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_acct TEXT;
    v_cash TEXT;
    v_lines JSONB;
BEGIN
    BEGIN
        SELECT COALESCE(account_code, '5900') INTO v_acct
          FROM expense_categories WHERE id = NEW.category_id;
        v_acct := COALESCE(v_acct, '5900');
        v_cash := cash_account_code(NEW.payment_method);
        v_lines := jsonb_build_array(
            jsonb_build_object('code',v_acct,'debit',NEW.amount,'credit',0,'memo',NEW.description),
            jsonb_build_object('code',v_cash,'debit',0,'credit',NEW.amount,'memo','Expense paid'));
        PERFORM post_journal(NEW.school_id, NEW.expense_date,
            'Expense: ' || COALESCE(NEW.description,''), 'expense', NEW.id, v_lines);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (NEW.school_id, 'expense', NEW.id, SQLERRM);
    END;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ledger_expense ON expenses;
CREATE TRIGGER trg_ledger_expense
    AFTER INSERT ON expenses
    FOR EACH ROW EXECUTE FUNCTION trg_post_expense();

-- ── Income: cash up, income account (by category) up
CREATE OR REPLACE FUNCTION trg_post_income()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_acct TEXT;
    v_lines JSONB;
BEGIN
    BEGIN
        SELECT COALESCE(account_code, '4100') INTO v_acct
          FROM income_categories WHERE id = NEW.category_id;
        v_acct := COALESCE(v_acct, '4100');
        v_lines := jsonb_build_array(
            jsonb_build_object('code','1010','debit',NEW.amount,'credit',0,'memo','Income received'),
            jsonb_build_object('code',v_acct,'debit',0,'credit',NEW.amount,'memo',NEW.description));
        PERFORM post_journal(NEW.school_id, NEW.date,
            'Income: ' || COALESCE(NEW.description,''), 'income', NEW.id, v_lines);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (NEW.school_id, 'income', NEW.id, SQLERRM);
    END;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ledger_income ON income;
CREATE TRIGGER trg_ledger_income
    AFTER INSERT ON income
    FOR EACH ROW EXECUTE FUNCTION trg_post_income();

-- ── Uniform sale: cash in, uniform-sales income up (void on delete)
CREATE OR REPLACE FUNCTION trg_post_uniform_sale()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE v_cash TEXT; v_lines JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        BEGIN
            v_cash := cash_account_code(OLD.payment_method);
            v_lines := jsonb_build_array(
                jsonb_build_object('code','4200','debit',OLD.total_amount,'credit',0,'memo','Void uniform sale'),
                jsonb_build_object('code',v_cash,'debit',0,'credit',OLD.total_amount,'memo','Void uniform sale'));
            PERFORM post_journal(OLD.school_id, CURRENT_DATE,
                'Void uniform sale ' || COALESCE(OLD.sale_number,''), 'uniform_sale_void', OLD.id, v_lines);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO ledger_errors (school_id, source_type, source_id, error)
            VALUES (OLD.school_id, 'uniform_sale_void', OLD.id, SQLERRM);
        END;
        RETURN OLD;
    END IF;

    BEGIN
        v_cash := cash_account_code(NEW.payment_method);
        v_lines := jsonb_build_array(
            jsonb_build_object('code',v_cash,'debit',NEW.total_amount,'credit',0,'memo','Uniform sale'),
            jsonb_build_object('code','4200','debit',0,'credit',NEW.total_amount,'memo','Uniform sale'));
        PERFORM post_journal(NEW.school_id, NEW.sale_date,
            'Uniform sale ' || COALESCE(NEW.sale_number,''), 'uniform_sale', NEW.id, v_lines);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (NEW.school_id, 'uniform_sale', NEW.id, SQLERRM);
    END;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ledger_uniform_sale ON uniform_sales;
CREATE TRIGGER trg_ledger_uniform_sale
    AFTER INSERT OR DELETE ON uniform_sales
    FOR EACH ROW EXECUTE FUNCTION trg_post_uniform_sale();

-- ── New schools get a chart automatically
CREATE OR REPLACE FUNCTION trg_seed_school_chart()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM seed_ledger_accounts(NEW.id);
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_seed_school_chart ON schools;
CREATE TRIGGER trg_seed_school_chart
    AFTER INSERT ON schools
    FOR EACH ROW EXECUTE FUNCTION trg_seed_school_chart();

-- ═════════════════════════════════════════════════════════════════
-- 5. BACKFILL — replay existing rows into the ledger (idempotent)
-- ═════════════════════════════════════════════════════════════════
-- Safe to re-run: post_journal skips any source row already posted.
-- Payments are replayed per invoice in date order so applied-vs-
-- overpayment is computed against the running receivable balance
-- (not the final invoice.paid_amount).
CREATE OR REPLACE FUNCTION backfill_ledger(p_school_id UUID)
RETURNS TABLE(invoices_posted INT, payments_posted INT, expenses_posted INT, income_posted INT)
LANGUAGE plpgsql AS $fn$
DECLARE
    v_inv    RECORD;
    v_pay    RECORD;
    v_exp    RECORD;
    v_inc    RECORD;
    v_revenue NUMERIC(14,2);
    v_credit  NUMERIC(14,2);
    v_running NUMERIC(14,2);
    v_applied NUMERIC(14,2);
    v_overpay NUMERIC(14,2);
    v_cash    TEXT;
    v_acct    TEXT;
    v_lines   JSONB;
    n_inv INT := 0; n_pay INT := 0; n_exp INT := 0; n_inc INT := 0;
BEGIN
    PERFORM ensure_chart_seeded(p_school_id);

    -- Invoices (issued, not draft/cancelled) + their payments, per invoice.
    FOR v_inv IN
        SELECT id, reference, amount, paid_amount, credit_applied, carry_forward_amount,
               status, issued_at, created_at
          FROM invoices
         WHERE school_id = p_school_id
           AND status NOT IN ('draft','cancelled')
         ORDER BY COALESCE(issued_at, created_at)
    LOOP
        v_revenue := GREATEST(0, COALESCE(v_inv.amount,0) - COALESCE(v_inv.carry_forward_amount,0));
        v_credit  := GREATEST(0, COALESCE(v_inv.credit_applied,0));
        v_lines   := jsonb_build_array(
            jsonb_build_object('code','1200','debit',v_revenue,'credit',0,'memo','Fees receivable'),
            jsonb_build_object('code','4000','debit',0,'credit',v_revenue,'memo','Fee income'));
        IF v_credit > 0 THEN
            v_lines := v_lines || jsonb_build_array(
                jsonb_build_object('code','2000','debit',v_credit,'credit',0,'memo','Credit applied'),
                jsonb_build_object('code','1200','debit',0,'credit',v_credit,'memo','Credit applied to fees'));
        END IF;
        IF post_journal(p_school_id, COALESCE(v_inv.issued_at::date, v_inv.created_at::date, CURRENT_DATE),
               'Invoice ' || COALESCE(v_inv.reference,''), 'invoice', v_inv.id, v_lines) IS NOT NULL THEN
            n_inv := n_inv + 1;
        END IF;

        -- Replay this invoice's payments against a running balance.
        v_running := v_revenue;   -- receivable owed after credit already applied
        FOR v_pay IN
            SELECT id, amount, method, transaction_ref, receipt_number, payment_date, paid_at
              FROM payments
             WHERE invoice_id = v_inv.id
             ORDER BY COALESCE(payment_date, paid_at::date), paid_at
        LOOP
            IF lower(COALESCE(v_pay.method,'')) = 'credit_balance' THEN
                v_lines := jsonb_build_array(
                    jsonb_build_object('code','2000','debit',v_pay.amount,'credit',0,'memo','Paid from credit'),
                    jsonb_build_object('code','1200','debit',0,'credit',v_pay.amount,'memo','Fees receivable'));
            ELSE
                v_applied := LEAST(v_pay.amount, GREATEST(0, v_running));
                v_overpay := GREATEST(0, v_pay.amount - v_applied);
                v_running := v_running - v_applied;
                v_cash    := cash_account_code(v_pay.method);
                v_lines   := jsonb_build_array(
                    jsonb_build_object('code',v_cash,'debit',v_pay.amount,'credit',0,'memo','Payment received'));
                IF v_applied > 0 THEN
                    v_lines := v_lines || jsonb_build_array(
                        jsonb_build_object('code','1200','debit',0,'credit',v_applied,'memo','Fees receivable'));
                END IF;
                IF v_overpay > 0 THEN
                    v_lines := v_lines || jsonb_build_array(
                        jsonb_build_object('code','2000','debit',0,'credit',v_overpay,'memo','Overpayment → credit'));
                END IF;
            END IF;
            IF post_journal(p_school_id, COALESCE(v_pay.payment_date, v_pay.paid_at::date, CURRENT_DATE),
                   'Receipt ' || COALESCE(v_pay.receipt_number, v_pay.transaction_ref, ''),
                   'payment', v_pay.id, v_lines) IS NOT NULL THEN
                n_pay := n_pay + 1;
            END IF;
        END LOOP;
    END LOOP;

    -- Expenses.
    FOR v_exp IN
        SELECT e.id, e.amount, e.description, e.expense_date, e.payment_method,
               COALESCE(c.account_code,'5900') AS acct
          FROM expenses e
          LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE e.school_id = p_school_id
    LOOP
        v_cash := cash_account_code(v_exp.payment_method);
        v_lines := jsonb_build_array(
            jsonb_build_object('code',COALESCE(v_exp.acct,'5900'),'debit',v_exp.amount,'credit',0,'memo',v_exp.description),
            jsonb_build_object('code',v_cash,'debit',0,'credit',v_exp.amount,'memo','Expense paid'));
        IF post_journal(p_school_id, v_exp.expense_date,
               'Expense: ' || COALESCE(v_exp.description,''), 'expense', v_exp.id, v_lines) IS NOT NULL THEN
            n_exp := n_exp + 1;
        END IF;
    END LOOP;

    -- Other income.
    FOR v_inc IN
        SELECT i.id, i.amount, i.description, i.date,
               COALESCE(c.account_code,'4100') AS acct
          FROM income i
          LEFT JOIN income_categories c ON c.id = i.category_id
         WHERE i.school_id = p_school_id
    LOOP
        v_lines := jsonb_build_array(
            jsonb_build_object('code','1010','debit',v_inc.amount,'credit',0,'memo','Income received'),
            jsonb_build_object('code',COALESCE(v_inc.acct,'4100'),'debit',0,'credit',v_inc.amount,'memo',v_inc.description));
        IF post_journal(p_school_id, v_inc.date,
               'Income: ' || COALESCE(v_inc.description,''), 'income', v_inc.id, v_lines) IS NOT NULL THEN
            n_inc := n_inc + 1;
        END IF;
    END LOOP;

    -- Uniform sales.
    FOR v_inc IN
        SELECT id, total_amount, sale_number, sale_date, payment_method
          FROM uniform_sales WHERE school_id = p_school_id
    LOOP
        v_cash := cash_account_code(v_inc.payment_method);
        v_lines := jsonb_build_array(
            jsonb_build_object('code',v_cash,'debit',v_inc.total_amount,'credit',0,'memo','Uniform sale'),
            jsonb_build_object('code','4200','debit',0,'credit',v_inc.total_amount,'memo','Uniform sale'));
        IF post_journal(p_school_id, v_inc.sale_date,
               'Uniform sale ' || COALESCE(v_inc.sale_number,''), 'uniform_sale', v_inc.id, v_lines) IS NOT NULL THEN
            n_inc := n_inc + 1;
        END IF;
    END LOOP;

    RETURN QUERY SELECT n_inv, n_pay, n_exp, n_inc;
END;
$fn$;

-- ═════════════════════════════════════════════════════════════════
-- 6. SEED EXISTING SCHOOLS
-- ═════════════════════════════════════════════════════════════════
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id FROM schools LOOP
        PERFORM seed_ledger_accounts(r.id);
    END LOOP;
END;
$do$;

GRANT EXECUTE ON FUNCTION seed_ledger_accounts(UUID)  TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION ensure_chart_seeded(UUID)     TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION coa_id(UUID, TEXT)            TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION post_journal(UUID, DATE, TEXT, TEXT, UUID, JSONB, UUID) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION cash_account_code(TEXT)       TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION backfill_ledger(UUID)         TO service_role, authenticated;

-- ── After running this migration, backfill each school once:
--     SELECT * FROM backfill_ledger('<school_id>');
--   (safe to re-run; it skips anything already posted)
-- ═════════════════════════════════════════════════════════════════
