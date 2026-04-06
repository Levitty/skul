-- Phase 1 Finance Integrity
-- Fixes: race conditions, atomic transactions, webhook idempotency, GL trigger timing

-- ============================================================================
-- 1. WEBHOOK IDEMPOTENCY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_type, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup ON webhook_events(event_type, event_id);

-- ============================================================================
-- 2. ATOMIC PAYMENT RECORDING
-- Eliminates the check-then-act race condition by locking the invoice row,
-- checking totals, inserting payment, and updating status in one transaction.
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
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;

    -- Lock the invoice row to prevent concurrent payment race conditions
    SELECT id, amount, status, student_id, school_id, due_date
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

    -- Calculate total already paid within this same transaction (lock guarantees no concurrent insert)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM payments
    WHERE invoice_id = p_invoice_id AND status = 'completed';

    v_new_total := v_total_paid + p_amount;

    IF v_new_total > v_invoice.amount THEN
        RAISE EXCEPTION 'Payment amount exceeds invoice balance. Invoice: %, Paid: %, Attempted: %',
            v_invoice.amount, v_total_paid, p_amount;
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

    -- Insert the payment
    INSERT INTO payments (
        invoice_id, amount, method, transaction_ref, status,
        paid_at, receipt_number, school_id, bank_account_id
    ) VALUES (
        p_invoice_id, p_amount, p_method, p_transaction_ref, 'completed',
        p_paid_at, p_receipt_number, p_school_id, v_final_bank_account_id
    ) RETURNING id INTO v_payment_id;

    -- Determine new invoice status (A5: partial takes precedence over overdue)
    IF v_new_total >= v_invoice.amount THEN
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

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'invoice_status', v_new_status,
        'total_paid', v_new_total,
        'student_id', v_invoice.student_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION record_payment_atomic(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, UUID) TO authenticated;

-- ============================================================================
-- 3. ATOMIC INVOICE + ITEMS CREATION
-- Inserts invoice and all line items in a single transaction so GL triggers
-- fire only after items exist.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_invoice_with_items(
    p_school_id UUID,
    p_student_id UUID,
    p_academic_year_id UUID,
    p_term_id UUID,
    p_reference TEXT,
    p_amount NUMERIC(12, 2),
    p_due_date DATE,
    p_issued_date DATE,
    p_account_id UUID,
    p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_invoice_id UUID;
    v_item JSONB;
BEGIN
    -- Insert the invoice
    INSERT INTO invoices (
        school_id, student_id, academic_year_id, term_id,
        reference, amount, status, due_date, issued_date, account_id
    ) VALUES (
        p_school_id, p_student_id, p_academic_year_id, p_term_id,
        p_reference, p_amount, 'unpaid', p_due_date, p_issued_date, p_account_id
    ) RETURNING id INTO v_invoice_id;

    -- Insert all line items in the same transaction
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO invoice_items (
            invoice_id, fee_structure_id, description, amount
        ) VALUES (
            v_invoice_id,
            CASE WHEN v_item->>'fee_structure_id' = '' OR v_item->>'fee_structure_id' IS NULL
                 THEN NULL
                 ELSE (v_item->>'fee_structure_id')::UUID
            END,
            v_item->>'description',
            (v_item->>'amount')::NUMERIC(12, 2)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'invoice_id', v_invoice_id,
        'reference', p_reference,
        'amount', p_amount,
        'status', 'unpaid',
        'items_count', jsonb_array_length(p_items)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_invoice_with_items(UUID, UUID, UUID, UUID, TEXT, NUMERIC, DATE, DATE, UUID, JSONB) TO authenticated;

-- ============================================================================
-- 4. FIX GL TRIGGER TIMING
-- The old trigger fires AFTER INSERT ON invoices, before items exist.
-- Replace it with a trigger on invoice_items that creates GL entries
-- once items are actually inserted.
-- ============================================================================

-- Drop the old premature trigger
DROP TRIGGER IF EXISTS trigger_invoice_gl_entry ON invoices;

-- New trigger function: fires per invoice_item row, but only creates GL entries
-- on the first item inserted for a given invoice (to avoid duplicate entries).
CREATE OR REPLACE FUNCTION trigger_invoice_items_gl_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice RECORD;
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_fee_type TEXT;
    v_existing_gl_count INTEGER;
BEGIN
    -- Check if GL entries already exist for this invoice (handles multi-item inserts)
    SELECT COUNT(*) INTO v_existing_gl_count
    FROM general_ledger
    WHERE reference_id = NEW.invoice_id AND reference_type = 'invoice';

    IF v_existing_gl_count > 0 THEN
        RETURN NEW;
    END IF;

    -- Get the invoice details
    SELECT id, school_id, amount, reference, issued_date
    INTO v_invoice
    FROM invoices
    WHERE id = NEW.invoice_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Get Accounts Receivable account (1200)
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE school_id = v_invoice.school_id AND account_code = '1200'
    LIMIT 1;

    -- Get fee type from the current item's fee_structure
    IF NEW.fee_structure_id IS NOT NULL THEN
        SELECT fee_type INTO v_fee_type
        FROM fee_structures
        WHERE id = NEW.fee_structure_id;
    END IF;

    IF v_fee_type IS NULL THEN
        v_fee_type := 'tuition';
    END IF;

    v_revenue_account_id := get_fee_revenue_account(v_invoice.school_id, v_fee_type);

    IF v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
        -- DR Accounts Receivable (full invoice amount)
        PERFORM create_gl_entry(
            v_invoice.school_id, v_ar_account_id, v_invoice.issued_date::DATE,
            'fee_invoice', v_invoice.id, 'invoice',
            'Invoice ' || v_invoice.reference || ' - ' || COALESCE(v_fee_type, 'tuition') || ' fees',
            v_invoice.amount, 0, NULL
        );

        -- CR Revenue (full invoice amount)
        PERFORM create_gl_entry(
            v_invoice.school_id, v_revenue_account_id, v_invoice.issued_date::DATE,
            'fee_invoice', v_invoice.id, 'invoice',
            'Invoice ' || v_invoice.reference || ' - ' || COALESCE(v_fee_type, 'tuition') || ' fees',
            0, v_invoice.amount, NULL
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the new trigger on invoice_items
DROP TRIGGER IF EXISTS trigger_invoice_items_gl_entry ON invoice_items;
CREATE TRIGGER trigger_invoice_items_gl_entry
    AFTER INSERT ON invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_invoice_items_gl_entry();
