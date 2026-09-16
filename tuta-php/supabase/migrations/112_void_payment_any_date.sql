-- ─────────────────────────────────────────────────────────────────
-- Migration 112: Allow voiding payments after the same calendar day
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor, then Reload Schema Cache.
-- Safe to re-run. Required if you already ran 111.
--
-- Wrong collections (e.g. KES 4,000 recorded a week ago) must VOID the
-- payment — reverse paid_amount — not shrink the invoice with a credit note.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION void_payment(
    p_payment_id   UUID,
    p_school_id    UUID,
    p_reason       TEXT,
    p_user_id      UUID    DEFAULT NULL,
    p_user_email   TEXT    DEFAULT NULL,
    p_same_day_only BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_pay          RECORD;
    v_invoice      RECORD;
    v_applied      NUMERIC(12,2);
    v_credit       NUMERIC(12,2);
    v_new_paid     NUMERIC(12,2);
    v_new_status   TEXT;
    v_pay_date     DATE;
    v_today        DATE := (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE;
    v_student_cred NUMERIC(12,2);
    v_cash         TEXT;
    v_lines        JSONB;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A void reason is required.');
    END IF;

    SELECT * INTO v_pay
      FROM payments
     WHERE id = p_payment_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment not found.');
    END IF;

    IF COALESCE(v_pay.status, '') = 'voided' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment is already voided.');
    END IF;

    IF COALESCE(v_pay.status, '') <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only completed payments can be voided.');
    END IF;

    v_pay_date := COALESCE(v_pay.payment_date, v_pay.paid_at::date, v_pay.created_at::date);
    IF p_same_day_only AND v_pay_date IS DISTINCT FROM v_today THEN
        RETURN jsonb_build_object('success', false,
            'error', 'This school only allows same-day payment voids. A second administrator can turn that off in Settings.');
    END IF;

    SELECT id, school_id, student_id, amount, paid_amount, status, reference
      INTO v_invoice
      FROM invoices
     WHERE id = v_pay.invoice_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice for this payment was not found.');
    END IF;

    v_applied := COALESCE(v_pay.applied_amount, NULL);
    v_credit  := COALESCE(v_pay.credit_amount, 0);
    IF v_applied IS NULL THEN
        v_applied := LEAST(v_pay.amount, COALESCE(v_invoice.paid_amount, 0));
        v_credit  := GREATEST(0, v_pay.amount - v_applied);
    END IF;

    v_new_paid := GREATEST(0, COALESCE(v_invoice.paid_amount, 0) - v_applied);
    v_new_status := CASE
        WHEN v_new_paid <= 0.005 THEN 'unpaid'
        WHEN v_new_paid + 0.005 >= v_invoice.amount THEN 'paid'
        ELSE 'partial'
    END;

    UPDATE invoices
       SET paid_amount = v_new_paid,
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = v_invoice.id;

    IF v_credit > 0 AND v_invoice.student_id IS NOT NULL THEN
        SELECT COALESCE(credit_balance, 0) INTO v_student_cred
          FROM students WHERE id = v_invoice.student_id FOR UPDATE;
        UPDATE students
           SET credit_balance = GREATEST(0, v_student_cred - v_credit),
               updated_at     = NOW()
         WHERE id = v_invoice.student_id;
    END IF;

    UPDATE payments
       SET status      = 'voided',
           voided_at   = NOW(),
           voided_by   = p_user_id,
           void_reason = TRIM(p_reason)
     WHERE id = p_payment_id;

    BEGIN
        IF lower(COALESCE(v_pay.method, '')) = 'credit_balance' THEN
            v_lines := jsonb_build_array(
                jsonb_build_object('code','1200','debit',v_pay.amount,'credit',0,'memo','Void: restore receivable'),
                jsonb_build_object('code','2000','debit',0,'credit',v_pay.amount,'memo','Void: restore student credit'));
        ELSE
            v_cash := cash_account_code(v_pay.method);
            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_cash,'debit',0,'credit',v_pay.amount,'memo','Void: reverse cash in'));
            IF v_applied > 0 THEN
                v_lines := v_lines || jsonb_build_array(
                    jsonb_build_object('code','1200','debit',v_applied,'credit',0,'memo','Void: restore receivable'));
            END IF;
            IF v_credit > 0 THEN
                v_lines := v_lines || jsonb_build_array(
                    jsonb_build_object('code','2000','debit',v_credit,'credit',0,'memo','Void: reverse overpayment credit'));
            END IF;
        END IF;

        PERFORM post_journal(
            p_school_id, v_today,
            'Void receipt ' || COALESCE(v_pay.receipt_number, v_pay.transaction_ref, p_payment_id::text),
            'payment_void', p_payment_id, v_lines, p_user_id
        );
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (p_school_id, 'payment_void', p_payment_id, SQLERRM);
    END;

    INSERT INTO audit_logs (
        school_id, user_id, user_email,
        action, entity_type, entity_id, payload
    ) VALUES (
        p_school_id, p_user_id, p_user_email,
        'void', 'payment', p_payment_id,
        jsonb_build_object(
            'reason', p_reason,
            'amount', v_pay.amount,
            'applied_reversed', v_applied,
            'credit_reversed', v_credit,
            'invoice_id', v_invoice.id,
            'invoice_reference', v_invoice.reference,
            'new_invoice_status', v_new_status,
            'new_paid_amount', v_new_paid
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'invoice_id', v_invoice.id,
        'invoice_status', v_new_status,
        'paid_amount', v_new_paid,
        'balance', GREATEST(0, v_invoice.amount - v_new_paid)
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION void_payment(UUID, UUID, TEXT, UUID, TEXT, BOOLEAN)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION void_payment IS
    'Voids a completed payment: reverses invoice paid_amount (bill total unchanged). '
    'Same-day restriction is optional via p_same_day_only (default false).';
