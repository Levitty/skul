-- ─────────────────────────────────────────────────────────────────
-- Migration 058: Atomic record_payment RPC (replaces broken 040b)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- This function is the SAFE replacement for the read-modify-write
-- payment logic currently scattered across PHP (payments.php,
-- invoices.php, family.php). The PHP code will be rewritten to
-- call this single function in step 4.
--
-- Why this is needed:
--   The PHP code reads invoice.paid_amount, calculates the new value
--   in PHP, then writes it back. Two concurrent payments on the same
--   invoice both read the same starting value and one overwrites the
--   other — payment lost. This function uses SELECT...FOR UPDATE to
--   lock the invoice row, so concurrent callers serialize cleanly.
--
-- What the function does, in order, in ONE transaction:
--   1. Validates inputs (amount > 0).
--   2. Locks the invoice row with FOR UPDATE.
--   3. Validates tenant + invoice status (rejects cancelled/draft/paid/carried_forward).
--   4. Computes new paid_amount, status, and any overpayment.
--   5. Inserts the payment row (catching duplicate transaction_ref).
--   6. Updates the invoice paid_amount + status.
--   7. Adds overpayment to student.credit_balance.
--   8. Writes audit_logs row (guaranteed, not best-effort).
--   9. Returns JSONB with payment_id, new status, balance, overpayment.
--
-- All steps succeed or all roll back. No half-completed payments.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_payment(
    p_invoice_id      UUID,
    p_school_id       UUID,
    p_amount          NUMERIC,
    p_method          TEXT    DEFAULT 'cash',
    p_transaction_ref TEXT    DEFAULT NULL,
    p_payment_date    DATE    DEFAULT NULL,
    p_user_id         UUID    DEFAULT NULL,
    p_user_email      TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_invoice         RECORD;
    v_payment_id      UUID;
    v_balance_owed    NUMERIC(12,2);
    v_amount_to_inv   NUMERIC(12,2);
    v_overpayment     NUMERIC(12,2);
    v_new_paid        NUMERIC(12,2);
    v_new_status      TEXT;
    v_payment_date    DATE := COALESCE(p_payment_date, CURRENT_DATE);
    v_clean_ref       TEXT := NULLIF(TRIM(COALESCE(p_transaction_ref, '')), '');
BEGIN
    -- ── 1. Validate amount ────────────────────────────────────────
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero'
            USING ERRCODE = '22023';
    END IF;

    -- ── 2. Lock the invoice row ───────────────────────────────────
    -- THIS is the critical line. FOR UPDATE blocks any other
    -- transaction trying to touch this same invoice until we commit.
    SELECT id, school_id, student_id, amount, paid_amount, status, reference
      INTO v_invoice
      FROM invoices
     WHERE id = p_invoice_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id
            USING ERRCODE = 'P0002';
    END IF;

    -- ── 3. Tenant + status validation ─────────────────────────────
    IF v_invoice.school_id != p_school_id THEN
        RAISE EXCEPTION 'Invoice does not belong to this school'
            USING ERRCODE = '42501';
    END IF;

    IF v_invoice.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot pay a cancelled invoice (%)', v_invoice.reference
            USING ERRCODE = '22023';
    END IF;

    IF v_invoice.status = 'draft' THEN
        RAISE EXCEPTION 'Cannot pay draft invoice (%) — issue it first', v_invoice.reference
            USING ERRCODE = '22023';
    END IF;

    IF v_invoice.status = 'carried_forward' THEN
        RAISE EXCEPTION 'Invoice (%) balance was carried forward — pay the new invoice instead', v_invoice.reference
            USING ERRCODE = '22023';
    END IF;

    IF v_invoice.status = 'paid' THEN
        RAISE EXCEPTION 'Invoice (%) is already fully paid', v_invoice.reference
            USING ERRCODE = '22023';
    END IF;

    -- ── 4. Compute amounts ────────────────────────────────────────
    v_balance_owed  := v_invoice.amount - v_invoice.paid_amount;
    v_amount_to_inv := LEAST(p_amount, v_balance_owed);
    v_overpayment   := GREATEST(0, p_amount - v_balance_owed);
    v_new_paid      := v_invoice.paid_amount + v_amount_to_inv;
    v_new_status    := CASE
                         WHEN v_new_paid >= v_invoice.amount THEN 'paid'
                         ELSE 'partial'
                       END;

    -- ── 5. Insert payment (catches duplicate transaction_ref) ─────
    BEGIN
        INSERT INTO payments (
            invoice_id, school_id, amount, method, transaction_ref,
            status, paid_at, payment_date
        ) VALUES (
            p_invoice_id, p_school_id, p_amount, p_method, v_clean_ref,
            'completed',
            (v_payment_date::TEXT || 'T00:00:00Z')::TIMESTAMPTZ,
            v_payment_date
        )
        RETURNING id INTO v_payment_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Transaction reference "%" has already been used. Each reference must be unique.', v_clean_ref
                USING ERRCODE = '23505';
    END;

    -- ── 6. Update invoice ─────────────────────────────────────────
    UPDATE invoices
       SET paid_amount = v_new_paid,
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = p_invoice_id;

    -- ── 7. Overpayment → student credit balance ───────────────────
    IF v_overpayment > 0 AND v_invoice.student_id IS NOT NULL THEN
        UPDATE students
           SET credit_balance = COALESCE(credit_balance, 0) + v_overpayment,
               updated_at     = NOW()
         WHERE id = v_invoice.student_id;
    END IF;

    -- ── 8. Audit log (guaranteed, in-transaction) ────────────────
    INSERT INTO audit_logs (
        school_id, user_id, user_email,
        action, entity_type, entity_id, payload
    ) VALUES (
        p_school_id, p_user_id, p_user_email,
        'payment', 'invoice', p_invoice_id,
        jsonb_build_object(
            'payment_id',      v_payment_id,
            'amount',          p_amount,
            'method',          p_method,
            'transaction_ref', v_clean_ref,
            'overpayment',     v_overpayment,
            'new_status',      v_new_status,
            'new_paid_amount', v_new_paid
        )
    );

    -- ── 9. Return result ──────────────────────────────────────────
    RETURN jsonb_build_object(
        'success',         true,
        'payment_id',      v_payment_id,
        'invoice_status',  v_new_status,
        'paid_amount',     v_new_paid,
        'balance',         v_invoice.amount - v_new_paid,
        'overpayment',     v_overpayment
    );
END;
$fn$;

-- Grant execute to the roles that PHP and authenticated users use
GRANT EXECUTE ON FUNCTION record_payment(UUID, UUID, NUMERIC, TEXT, TEXT, DATE, UUID, TEXT)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION record_payment IS
    'Atomic invoice payment recorder. Locks the invoice row, applies payment, '
    'handles overpayment as student credit, writes audit log — all in one transaction. '
    'Replaces the read-modify-write logic in payments.php / invoices.php / family.php.';

-- ════════════════════════════════════════════════════════════════
-- Verification: function exists, has the right signature, and runs.
-- The TEST block at the bottom is wrapped in BEGIN/ROLLBACK so
-- nothing is actually written to the database.
-- ════════════════════════════════════════════════════════════════
--
-- Run this AFTER the CREATE FUNCTION above to confirm:
--
--   SELECT
--     proname AS function_name,
--     pg_get_function_arguments(oid) AS arguments,
--     pg_get_function_result(oid)    AS returns
--   FROM pg_proc
--   WHERE proname = 'record_payment';
--
-- Expected: 1 row, function_name = 'record_payment', returns 'jsonb'.
