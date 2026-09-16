-- Migration 053: Family billing, credit balances, unique transaction references
-- Run in Supabase Dashboard → SQL Editor (without RLS)
-- After running: Settings → API → Reload Schema Cache

-- ============================================
-- 1. Students: family_id + credit_balance
-- ============================================
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS family_id TEXT,
    ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN students.family_id IS 'Manual family identifier — students with the same family_id are siblings';
COMMENT ON COLUMN students.credit_balance IS 'Overpayment credit carried forward, auto-applied to next invoice';

CREATE INDEX IF NOT EXISTS idx_students_family_id
    ON students (school_id, family_id)
    WHERE family_id IS NOT NULL;

-- ============================================
-- 2. Invoices: track credit applied
-- ============================================
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS credit_applied DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN invoices.credit_applied IS 'Amount auto-deducted from student credit balance when invoice was generated';

-- ============================================
-- 3. Payments: unique transaction references
-- ============================================
-- Partial unique index — only enforces uniqueness on non-null refs within a school
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_transaction_ref
    ON payments (school_id, transaction_ref)
    WHERE transaction_ref IS NOT NULL AND transaction_ref != '';

-- ============================================
-- 4. RPC: get siblings by family_id
-- ============================================
CREATE OR REPLACE FUNCTION get_family_invoices(p_family_id TEXT, p_school_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    IF p_family_id IS NULL OR p_family_id = '' THEN
        RETURN NULL;
    END IF;

    SELECT json_build_object(
        'students', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', s.id,
                'first_name', s.first_name,
                'last_name', s.last_name,
                'admission_number', s.admission_number,
                'current_class_id', s.current_class_id,
                'credit_balance', s.credit_balance,
                'family_id', s.family_id
            ) ORDER BY s.first_name), '[]'::json)
            FROM students s
            WHERE s.school_id = p_school_id
              AND s.family_id = p_family_id
              AND s.status = 'active'
        ),
        'invoices', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', i.id,
                'reference', i.reference,
                'student_id', i.student_id,
                'amount', i.amount,
                'paid_amount', i.paid_amount,
                'credit_applied', i.credit_applied,
                'status', i.status,
                'due_date', i.due_date,
                'created_at', i.created_at
            ) ORDER BY i.created_at DESC), '[]'::json)
            FROM invoices i
            JOIN students s ON s.id = i.student_id
            WHERE i.school_id = p_school_id
              AND s.family_id = p_family_id
              AND i.status IN ('unpaid', 'partial')
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================
-- 5. RPC: check if transaction_ref exists
-- ============================================
CREATE OR REPLACE FUNCTION check_transaction_ref(p_ref TEXT, p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM payments
        WHERE school_id = p_school_id
          AND transaction_ref = p_ref
    );
END;
$$;
