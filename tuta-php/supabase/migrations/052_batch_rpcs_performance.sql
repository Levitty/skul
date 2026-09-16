-- Migration 052: Batch RPCs for page performance
-- Run in Supabase Dashboard → SQL Editor (without RLS)
-- After running: Settings → API → Reload Schema Cache
--
-- These RPCs return multiple datasets in a single HTTP call,
-- eliminating the need for 3-5 separate API calls per page.

-- ============================================
-- 1. INVOICE PRINT — all data in one call
-- ============================================
CREATE OR REPLACE FUNCTION get_invoice_print(p_invoice_id UUID, p_school_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_invoice RECORD;
    v_student RECORD;
    v_class_name TEXT;
    v_section_name TEXT;
    v_group_name TEXT;
    v_term_name TEXT;
BEGIN
    -- Get invoice
    SELECT id, reference, student_id, amount, paid_amount, status, due_date,
           fee_group_id, term_id, created_at
    INTO v_invoice
    FROM invoices
    WHERE id = p_invoice_id AND school_id = p_school_id;

    IF v_invoice IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get student
    SELECT id, first_name, last_name, admission_number, current_class_id,
           section_id, guardian_name, guardian_phone, roll_number
    INTO v_student
    FROM students
    WHERE id = v_invoice.student_id;

    -- Get class name
    SELECT name INTO v_class_name FROM classes WHERE id = v_student.current_class_id;

    -- Get section name
    SELECT name INTO v_section_name FROM sections WHERE id = v_student.section_id;

    -- Get fee group name
    SELECT name INTO v_group_name FROM fee_groups WHERE id = v_invoice.fee_group_id;

    -- Get term name
    SELECT name INTO v_term_name FROM terms WHERE id = v_invoice.term_id;

    -- Build result
    SELECT json_build_object(
        'invoice', json_build_object(
            'id', v_invoice.id,
            'reference', v_invoice.reference,
            'student_id', v_invoice.student_id,
            'amount', v_invoice.amount,
            'paid_amount', v_invoice.paid_amount,
            'status', v_invoice.status,
            'due_date', v_invoice.due_date,
            'fee_group_id', v_invoice.fee_group_id,
            'term_id', v_invoice.term_id,
            'created_at', v_invoice.created_at
        ),
        'student', CASE WHEN v_student.id IS NOT NULL THEN json_build_object(
            'id', v_student.id,
            'first_name', v_student.first_name,
            'last_name', v_student.last_name,
            'admission_number', v_student.admission_number,
            'current_class_id', v_student.current_class_id,
            'section_id', v_student.section_id,
            'guardian_name', v_student.guardian_name,
            'guardian_phone', v_student.guardian_phone,
            'roll_number', v_student.roll_number
        ) ELSE NULL END,
        'class_name', v_class_name,
        'section_name', v_section_name,
        'group_name', v_group_name,
        'term_name', v_term_name,
        'items', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', ii.id,
                'description', ii.description,
                'amount', ii.amount
            )), '[]'::json)
            FROM invoice_items ii WHERE ii.invoice_id = p_invoice_id
        ),
        'payments', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', p.id,
                'amount', p.amount,
                'method', p.method,
                'transaction_ref', p.transaction_ref,
                'payment_date', p.payment_date,
                'paid_at', p.paid_at,
                'created_at', p.created_at
            ) ORDER BY p.created_at), '[]'::json)
            FROM payments p WHERE p.invoice_id = p_invoice_id AND p.status = 'completed'
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================
-- 2. RECEIPT — all data in one call
-- ============================================
CREATE OR REPLACE FUNCTION get_receipt(p_payment_id UUID, p_school_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_payment RECORD;
    v_invoice RECORD;
    v_student RECORD;
    v_class_name TEXT;
    v_section_name TEXT;
BEGIN
    -- Get payment
    SELECT id, invoice_id, amount, method, transaction_ref, paid_at, status, created_at
    INTO v_payment
    FROM payments WHERE id = p_payment_id;

    IF v_payment IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get invoice
    SELECT id, reference, student_id, amount, paid_amount, status, due_date
    INTO v_invoice
    FROM invoices
    WHERE id = v_payment.invoice_id AND school_id = p_school_id;

    IF v_invoice IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get student
    SELECT id, first_name, last_name, admission_number, current_class_id,
           section_id, guardian_name, guardian_phone, roll_number
    INTO v_student
    FROM students WHERE id = v_invoice.student_id;

    -- Get class & section
    SELECT name INTO v_class_name FROM classes WHERE id = v_student.current_class_id;
    SELECT name INTO v_section_name FROM sections WHERE id = v_student.section_id;

    SELECT json_build_object(
        'payment', json_build_object(
            'id', v_payment.id,
            'invoice_id', v_payment.invoice_id,
            'amount', v_payment.amount,
            'method', v_payment.method,
            'transaction_ref', v_payment.transaction_ref,
            'paid_at', v_payment.paid_at,
            'status', v_payment.status,
            'created_at', v_payment.created_at
        ),
        'invoice', json_build_object(
            'id', v_invoice.id,
            'reference', v_invoice.reference,
            'student_id', v_invoice.student_id,
            'amount', v_invoice.amount,
            'paid_amount', v_invoice.paid_amount,
            'status', v_invoice.status,
            'due_date', v_invoice.due_date
        ),
        'student', CASE WHEN v_student.id IS NOT NULL THEN json_build_object(
            'id', v_student.id,
            'first_name', v_student.first_name,
            'last_name', v_student.last_name,
            'admission_number', v_student.admission_number,
            'current_class_id', v_student.current_class_id,
            'section_id', v_student.section_id,
            'guardian_name', v_student.guardian_name,
            'guardian_phone', v_student.guardian_phone,
            'roll_number', v_student.roll_number
        ) ELSE NULL END,
        'class_name', v_class_name,
        'section_name', v_section_name
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================
-- 3. INVOICES LIST — students in one call
-- ============================================
CREATE OR REPLACE FUNCTION get_invoices_page(p_school_id UUID, p_status TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'invoices', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', i.id,
                'reference', i.reference,
                'student_id', i.student_id,
                'amount', i.amount,
                'paid_amount', i.paid_amount,
                'status', i.status,
                'due_date', i.due_date,
                'created_at', i.created_at,
                'student_name', COALESCE(s.first_name || ' ' || s.last_name, ''),
                'admission_number', s.admission_number,
                'class_id', s.current_class_id
            ) ORDER BY i.created_at DESC), '[]'::json)
            FROM invoices i
            LEFT JOIN students s ON s.id = i.student_id
            WHERE i.school_id = p_school_id
            AND (p_status IS NULL OR i.status = p_status)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;
