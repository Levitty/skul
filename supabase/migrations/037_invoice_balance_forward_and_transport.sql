-- Migration 037: Invoice Balance Carry-Forward, Transport Fix, Overpayment Handling
-- Fixes three critical billing issues:
-- 1. Transport fees not pulling from actual student route assignments
-- 2. No balance carry-forward between terms/years
-- 3. Overpayments rejected instead of handled

-- ============================================================================
-- 1. STUDENT BALANCE LEDGER
-- Tracks running balance per student across all terms/years.
-- Positive = student owes money. Negative = school owes student (overpayment).
-- ============================================================================

-- Add balance_brought_forward to invoices so each invoice can show prior debt/credit
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balance_brought_forward NUMERIC(12, 2) DEFAULT 0;

-- ============================================================================
-- 2. FIX: record_payment_atomic TO HANDLE OVERPAYMENTS
-- Instead of throwing an error when payment exceeds invoice amount,
-- record the overpayment and create an automatic credit note.
-- ============================================================================
CREATE OR REPLACE FUNCTION record_payment_atomic(
    p_invoice_id UUID,
    p_amount NUMERIC(12, 2),
    p_method TEXT,
    p_transaction_ref TEXT,
    p_paid_at TIMESTAMPTZ,
    p_receipt_number TEXT,
    p_school_id UUID,
    p_bank_account_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_total_paid NUMERIC(12, 2);
    v_new_total NUMERIC(12, 2);
    v_payment_id UUID;
    v_new_status TEXT;
    v_bank_school_id UUID;
    v_final_bank_account_id UUID;
    v_overpayment NUMERIC(12, 2) := 0;
    v_credit_note_id UUID;
    v_effective_amount NUMERIC(12, 2);
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    -- Lock the invoice row to prevent concurrent payment race conditions
    SELECT id, amount, status, student_id, school_id, due_date,
           COALESCE(discount_amount, 0) as discount_amount
    INTO v_invoice
    FROM invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_invoice.school_id != p_school_id THEN
        RAISE EXCEPTION 'Invoice not found or access denied';
    END IF;

    -- Calculate total already paid
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM payments
    WHERE invoice_id = p_invoice_id AND status = 'completed';

    v_new_total := v_total_paid + p_amount;
    v_effective_amount := v_invoice.amount - v_invoice.discount_amount;

    -- Check for overpayment - instead of rejecting, handle it
    IF v_new_total > v_effective_amount THEN
        v_overpayment := v_new_total - v_effective_amount;
    END IF;

    -- Verify bank account belongs to school if provided
    v_final_bank_account_id := NULL;
    IF p_bank_account_id IS NOT NULL THEN
        SELECT school_id INTO v_bank_school_id
        FROM bank_accounts
        WHERE id = p_bank_account_id;

        IF v_bank_school_id = p_school_id THEN
            v_final_bank_account_id := p_bank_account_id;
        END IF;
    END IF;

    -- Insert the full payment (including any overpayment portion)
    INSERT INTO payments (
        invoice_id, amount, method, transaction_ref, status,
        paid_at, receipt_number, school_id, bank_account_id
    ) VALUES (
        p_invoice_id, p_amount, p_method, p_transaction_ref, 'completed',
        p_paid_at, p_receipt_number, p_school_id, v_final_bank_account_id
    ) RETURNING id INTO v_payment_id;

    -- Determine new invoice status
    IF v_new_total >= v_effective_amount THEN
        v_new_status := 'paid';
    ELSIF v_new_total > 0 THEN
        v_new_status := 'partial';
    ELSE
        v_new_status := 'unpaid';
    END IF;

    -- Update invoice status atomically
    UPDATE invoices
    SET status = v_new_status, updated_at = NOW()
    WHERE id = p_invoice_id;

    -- If overpayment, auto-create a credit note for the student
    IF v_overpayment > 0 THEN
        INSERT INTO credit_notes (
            school_id, invoice_id, student_id, credit_number,
            amount, reason, status, issued_at
        ) VALUES (
            p_school_id, p_invoice_id, v_invoice.student_id,
            'CN-AUTO-' || encode(gen_random_bytes(4), 'hex'),
            v_overpayment,
            'Automatic credit from overpayment on invoice',
            'approved',
            NOW()
        ) RETURNING id INTO v_credit_note_id;
    END IF;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'invoice_status', v_new_status,
        'total_paid', v_new_total,
        'student_id', v_invoice.student_id,
        'overpayment', v_overpayment,
        'credit_note_id', v_credit_note_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. HELPER: GET STUDENT BALANCE
-- Returns the net balance for a student across ALL invoices and payments.
-- Positive = owes money. Negative = has credit.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_student_balance(
    p_student_id UUID,
    p_school_id UUID,
    p_exclude_term_id UUID DEFAULT NULL
)
RETURNS NUMERIC(12, 2) AS $$
DECLARE
    v_total_invoiced NUMERIC(12, 2);
    v_total_discounts NUMERIC(12, 2);
    v_total_paid NUMERIC(12, 2);
    v_total_credits_applied NUMERIC(12, 2);
BEGIN
    -- Sum all invoices (excluding cancelled and optionally excluding a specific term)
    SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(COALESCE(discount_amount, 0)), 0)
    INTO v_total_invoiced, v_total_discounts
    FROM invoices
    WHERE student_id = p_student_id
      AND school_id = p_school_id
      AND status != 'cancelled'
      AND (p_exclude_term_id IS NULL OR term_id != p_exclude_term_id);

    -- Sum all completed payments
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_total_paid
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    WHERE i.student_id = p_student_id
      AND i.school_id = p_school_id
      AND p.status = 'completed'
      AND i.status != 'cancelled'
      AND (p_exclude_term_id IS NULL OR i.term_id != p_exclude_term_id);

    -- Sum applied credit notes (these reduce what the student owes)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_credits_applied
    FROM credit_notes
    WHERE student_id = p_student_id
      AND school_id = p_school_id
      AND status = 'applied';

    RETURN (v_total_invoiced - v_total_discounts) - v_total_paid - v_total_credits_applied;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_student_balance(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- 4. HELPER: GET STUDENT TRANSPORT FEE
-- Looks up a student's actual transport route assignment and returns the fee.
-- Falls back to generic fee_structure if no route assignment found.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_student_transport_fee(
    p_student_id UUID,
    p_school_id UUID,
    p_academic_year_id UUID,
    p_term_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_transport RECORD;
    v_route RECORD;
    v_fee_structure RECORD;
BEGIN
    -- First: check student_transport for a specific route assignment
    SELECT st.*, rs.name as stop_name
    INTO v_transport
    FROM student_transport st
    LEFT JOIN route_stops rs ON rs.id = st.stop_id
    WHERE st.student_id = p_student_id
      AND st.academic_year_id = p_academic_year_id
      AND (st.term_id = p_term_id OR st.term_id IS NULL)
    ORDER BY st.created_at DESC
    LIMIT 1;

    IF FOUND AND v_transport.fee_amount > 0 THEN
        -- Get route name for description
        SELECT name INTO v_route
        FROM transport_routes
        WHERE id = v_transport.route_id;

        RETURN jsonb_build_object(
            'amount', v_transport.fee_amount,
            'description', 'Transport Fee - ' || COALESCE(v_route.name, 'Route') ||
                          CASE WHEN v_transport.stop_name IS NOT NULL
                               THEN ' (' || v_transport.stop_name || ')'
                               ELSE '' END,
            'source', 'student_transport'
        );
    END IF;

    -- Fallback: check fee_structures for a generic transport fee
    SELECT * INTO v_fee_structure
    FROM fee_structures
    WHERE school_id = p_school_id
      AND academic_year_id = p_academic_year_id
      AND fee_type = 'transport'
      AND is_active = true
      AND (term_id = p_term_id OR term_id IS NULL)
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'amount', v_fee_structure.amount,
            'description', v_fee_structure.name,
            'fee_structure_id', v_fee_structure.id,
            'source', 'fee_structure'
        );
    END IF;

    -- No transport fee found
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_student_transport_fee(UUID, UUID, UUID, UUID) TO authenticated;
