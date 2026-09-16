-- ─────────────────────────────────────────────────────────────────
-- Migration 111: Fees corrections — same-day payment void + credit notes
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- Adds:
--   • payments.applied_amount / credit_amount / void_* columns; status 'voided'
--   • record_payment writes applied/credit split
--   • void_payment RPC (+ GL reverse via post_journal source_type payment_void)
--   • credit_notes hardening (reason_code, credit_number uniqueness)
--   • create_credit_note / apply_credit_note / void_credit_note_draft RPCs
--   • decide_approval_request handles void_payment + apply_credit_note
-- ─────────────────────────────────────────────────────────────────

-- ── 1. Payments: void + applied/credit split ─────────────────────

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS credit_amount  NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS voided_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by      UUID,
    ADD COLUMN IF NOT EXISTS void_reason    TEXT;

-- Expand status check to include voided (and keep legacy values).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'payments'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE payments DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE payments
    ADD CONSTRAINT payments_status_check
    CHECK (status IS NULL OR status IN (
        'pending', 'completed', 'failed', 'refunded', 'cancelled', 'voided'
    ));

-- ── 2. Credit notes hardening ────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_notes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    invoice_id     UUID REFERENCES invoices(id) ON DELETE CASCADE,
    student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    credit_number  TEXT NOT NULL,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason         TEXT NOT NULL,
    issued_by      UUID,
    issued_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS invoice_item_id UUID;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS amount_to_invoice NUMERIC(12,2);
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS amount_to_credit  NUMERIC(12,2);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'credit_notes_status_check'
    ) THEN
        ALTER TABLE credit_notes
            ADD CONSTRAINT credit_notes_status_check
            CHECK (status IN ('draft', 'approved', 'applied', 'voided'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notes_school_number
    ON credit_notes (school_id, credit_number);

CREATE INDEX IF NOT EXISTS idx_credit_notes_school_status
    ON credit_notes (school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice
    ON credit_notes (invoice_id);

-- RLS: PHP talks via service_role (bypasses RLS). Scope the policy to
-- service_role only — same lockdown as mig 086 (no USING(true) for anon).
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_credit_notes" ON credit_notes;
DROP POLICY IF EXISTS "credit_notes_school_access" ON credit_notes;
CREATE POLICY "srv_credit_notes" ON credit_notes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. record_payment — persist applied_amount / credit_amount ───

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
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero'
            USING ERRCODE = '22023';
    END IF;

    SELECT id, school_id, student_id, amount, paid_amount, status, reference
      INTO v_invoice
      FROM invoices
     WHERE id = p_invoice_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id
            USING ERRCODE = 'P0002';
    END IF;

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

    v_balance_owed  := v_invoice.amount - COALESCE(v_invoice.paid_amount, 0);
    v_amount_to_inv := LEAST(p_amount, v_balance_owed);
    v_overpayment   := GREATEST(0, p_amount - v_balance_owed);
    v_new_paid      := COALESCE(v_invoice.paid_amount, 0) + v_amount_to_inv;
    v_new_status    := CASE
                         WHEN v_new_paid >= v_invoice.amount THEN 'paid'
                         ELSE 'partial'
                       END;

    BEGIN
        INSERT INTO payments (
            invoice_id, school_id, amount, method, transaction_ref,
            status, paid_at, payment_date,
            applied_amount, credit_amount
        ) VALUES (
            p_invoice_id, p_school_id, p_amount, p_method, v_clean_ref,
            'completed',
            (v_payment_date::TEXT || 'T00:00:00Z')::TIMESTAMPTZ,
            v_payment_date,
            v_amount_to_inv, v_overpayment
        )
        RETURNING id INTO v_payment_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Transaction reference "%" has already been used. Each reference must be unique.', v_clean_ref
                USING ERRCODE = '23505';
    END;

    UPDATE invoices
       SET paid_amount = v_new_paid,
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = p_invoice_id;

    IF v_overpayment > 0 AND v_invoice.student_id IS NOT NULL THEN
        UPDATE students
           SET credit_balance = COALESCE(credit_balance, 0) + v_overpayment,
               updated_at     = NOW()
         WHERE id = v_invoice.student_id;
    END IF;

    INSERT INTO audit_logs (
        school_id, user_id, user_email,
        action, entity_type, entity_id, payload
    ) VALUES (
        p_school_id, p_user_id, p_user_email,
        'payment', 'invoice', p_invoice_id,
        jsonb_build_object(
            'payment_id',      v_payment_id,
            'amount',          p_amount,
            'applied_amount',  v_amount_to_inv,
            'credit_amount',   v_overpayment,
            'method',          p_method,
            'transaction_ref', v_clean_ref,
            'overpayment',     v_overpayment,
            'new_status',      v_new_status,
            'new_paid_amount', v_new_paid
        )
    );

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

GRANT EXECUTE ON FUNCTION record_payment(UUID, UUID, NUMERIC, TEXT, TEXT, DATE, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 4. void_payment RPC ──────────────────────────────────────────

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

    -- Prefer stored split; fall back for older rows.
    v_applied := COALESCE(v_pay.applied_amount, NULL);
    v_credit  := COALESCE(v_pay.credit_amount, 0);
    IF v_applied IS NULL THEN
        -- Best-effort: assume entire amount applied, capped by current paid_amount.
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

    -- GL reverse (swap sides of the original payment posting).
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

-- ── 5. create_credit_note ────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_credit_note(
    p_school_id       UUID,
    p_student_id      UUID,
    p_invoice_id      UUID,
    p_amount          NUMERIC,
    p_reason          TEXT,
    p_reason_code     TEXT DEFAULT 'billing_error',
    p_description     TEXT DEFAULT NULL,
    p_invoice_item_id UUID DEFAULT NULL,
    p_user_id         UUID DEFAULT NULL,
    p_user_email      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_invoice   RECORD;
    v_id        UUID;
    v_number    TEXT;
    v_seq       INT;
    v_desc      TEXT;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit amount must be greater than zero.');
    END IF;
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A reason is required.');
    END IF;

    SELECT id, school_id, student_id, amount, paid_amount, status, reference
      INTO v_invoice
      FROM invoices
     WHERE id = p_invoice_id AND school_id = p_school_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;

    IF v_invoice.student_id IS DISTINCT FROM p_student_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student does not match this invoice.');
    END IF;

    IF v_invoice.status IN ('cancelled', 'carried_forward') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot credit a cancelled or carried-forward invoice.');
    END IF;

    SELECT COALESCE(MAX(
        NULLIF(regexp_replace(credit_number, '^CN-[0-9]{4}-', ''), '')::INT
    ), 0) + 1
      INTO v_seq
      FROM credit_notes
     WHERE school_id = p_school_id
       AND credit_number ~ ('^CN-' || to_char(NOW(), 'YYYY') || '-[0-9]+$');

    v_number := 'CN-' || to_char(NOW(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');
    v_desc := COALESCE(NULLIF(TRIM(p_description), ''),
                       'Credit — ' || COALESCE(NULLIF(TRIM(p_reason_code), ''), 'adjustment'));

    INSERT INTO credit_notes (
        school_id, invoice_id, student_id, credit_number, amount, reason,
        reason_code, description, invoice_item_id, status, issued_by, issued_at
    ) VALUES (
        p_school_id, p_invoice_id, p_student_id, v_number, round(p_amount, 2),
        TRIM(p_reason), COALESCE(NULLIF(TRIM(p_reason_code), ''), 'billing_error'),
        v_desc, p_invoice_item_id, 'draft', p_user_id, NOW()
    )
    RETURNING id INTO v_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'create', 'credit_note', v_id,
            jsonb_build_object('credit_number', v_number, 'amount', p_amount,
                               'invoice_id', p_invoice_id, 'reason_code', p_reason_code));

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_id', v_id,
        'credit_number', v_number,
        'status', 'draft'
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION create_credit_note(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 6. apply_credit_note ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_credit_note(
    p_credit_note_id UUID,
    p_school_id      UUID,
    p_user_id        UUID DEFAULT NULL,
    p_user_email     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_cn           RECORD;
    v_invoice      RECORD;
    v_c            NUMERIC(12,2);
    v_old_amount   NUMERIC(12,2);
    v_new_amount   NUMERIC(12,2);
    v_paid         NUMERIC(12,2);
    v_to_invoice   NUMERIC(12,2);
    v_to_credit    NUMERIC(12,2);
    v_excess_paid  NUMERIC(12,2);
    v_new_status   TEXT;
    v_line_desc    TEXT;
    v_lines        JSONB;
    v_today        DATE := (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE;
BEGIN
    SELECT * INTO v_cn
      FROM credit_notes
     WHERE id = p_credit_note_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit note not found.');
    END IF;

    IF v_cn.status = 'applied' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit note is already applied.');
    END IF;

    IF v_cn.status = 'voided' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit note was voided.');
    END IF;

    IF v_cn.status NOT IN ('draft', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit note cannot be applied in its current status.');
    END IF;

    SELECT id, school_id, student_id, amount, paid_amount, status, reference
      INTO v_invoice
      FROM invoices
     WHERE id = v_cn.invoice_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;

    IF v_invoice.status IN ('cancelled', 'carried_forward') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot apply credit to a cancelled or carried-forward invoice.');
    END IF;

    v_c          := round(v_cn.amount, 2);
    v_old_amount := COALESCE(v_invoice.amount, 0);
    v_paid       := COALESCE(v_invoice.paid_amount, 0);

    v_line_desc := COALESCE(NULLIF(TRIM(v_cn.description), ''),
                            'Credit — ' || COALESCE(v_cn.reason_code, 'adjustment'));

    -- Always add a visible negative line for the full credit (parent-facing history).
    INSERT INTO invoice_items (invoice_id, description, amount)
    VALUES (v_invoice.id, v_line_desc, -v_c);

    SELECT COALESCE(SUM(amount), 0) INTO v_new_amount
      FROM invoice_items WHERE invoice_id = v_invoice.id;
    IF v_new_amount < 0 THEN v_new_amount := 0; END IF;
    v_new_amount := round(v_new_amount, 2);

    -- If paid now exceeds new amount, move the excess onto student credit.
    -- Otherwise the whole credit reduced open balance (no cash out).
    v_excess_paid := 0;
    v_to_credit   := 0;
    IF v_paid > v_new_amount THEN
        v_excess_paid := round(v_paid - v_new_amount, 2);
        v_paid        := v_new_amount;
        v_to_credit   := v_excess_paid;
    END IF;
    v_to_invoice := round(v_c - v_to_credit, 2);
    IF v_to_invoice < 0 THEN v_to_invoice := 0; END IF;

    v_new_status := CASE
        WHEN v_paid <= 0.005 AND v_new_amount > 0.005 THEN
            CASE WHEN v_invoice.status = 'draft' THEN 'draft' ELSE 'unpaid' END
        WHEN v_paid + 0.005 >= v_new_amount THEN 'paid'
        ELSE 'partial'
    END;
    -- Preserve draft if still a draft and nothing paid.
    IF v_invoice.status = 'draft' AND v_paid <= 0.005 THEN
        v_new_status := 'draft';
    END IF;

    UPDATE invoices
       SET amount      = v_new_amount,
           paid_amount = v_paid,
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = v_invoice.id;

    IF v_to_credit > 0 THEN
        UPDATE students
           SET credit_balance = COALESCE(credit_balance, 0) + v_to_credit,
               updated_at     = NOW()
         WHERE id = v_cn.student_id;
    END IF;

    UPDATE credit_notes
       SET status            = 'applied',
           applied_at        = NOW(),
           amount_to_invoice = v_to_invoice,
           amount_to_credit  = v_to_credit
     WHERE id = p_credit_note_id;

    -- GL: reduce receivable for amount that was still owed; liability for credit on account.
    BEGIN
        v_lines := '[]'::jsonb;
        IF v_to_invoice > 0 THEN
            -- Was open AR; credit reduced the bill → reverse revenue/AR recognition net.
            v_lines := v_lines || jsonb_build_array(
                jsonb_build_object('code','4100','debit',v_to_invoice,'credit',0,'memo','Credit note — reduce fee income'),
                jsonb_build_object('code','1200','debit',0,'credit',v_to_invoice,'memo','Credit note — reduce receivable'));
        END IF;
        IF v_to_credit > 0 THEN
            -- School owes student (or already overpaid) → student credit liability.
            -- Contra: reduce fee income (billing error / withdrawn service).
            v_lines := v_lines || jsonb_build_array(
                jsonb_build_object('code','4100','debit',v_to_credit,'credit',0,'memo','Credit note — to student credit'),
                jsonb_build_object('code','2000','debit',0,'credit',v_to_credit,'memo','Student credit on account'));
        END IF;
        IF jsonb_array_length(v_lines) > 0 THEN
            PERFORM post_journal(
                p_school_id, v_today,
                'Credit note ' || v_cn.credit_number,
                'credit_note', p_credit_note_id, v_lines, p_user_id
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (p_school_id, 'credit_note', p_credit_note_id, SQLERRM);
    END;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'apply', 'credit_note', p_credit_note_id,
            jsonb_build_object(
                'credit_number', v_cn.credit_number,
                'amount', v_c,
                'amount_to_invoice', v_to_invoice,
                'amount_to_credit', v_to_credit,
                'invoice_id', v_invoice.id,
                'new_invoice_amount', v_new_amount,
                'new_paid_amount', v_paid,
                'new_status', v_new_status
            ));

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_id', p_credit_note_id,
        'credit_number', v_cn.credit_number,
        'invoice_id', v_invoice.id,
        'invoice_amount', v_new_amount,
        'paid_amount', v_paid,
        'invoice_status', v_new_status,
        'amount_to_invoice', v_to_invoice,
        'amount_to_credit', v_to_credit,
        'balance', GREATEST(0, v_new_amount - v_paid)
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION apply_credit_note(UUID, UUID, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 7. void_credit_note_draft ────────────────────────────────────

CREATE OR REPLACE FUNCTION void_credit_note_draft(
    p_credit_note_id UUID,
    p_school_id      UUID,
    p_user_id        UUID DEFAULT NULL,
    p_user_email     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_cn RECORD;
BEGIN
    SELECT * INTO v_cn
      FROM credit_notes
     WHERE id = p_credit_note_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit note not found.');
    END IF;

    IF v_cn.status = 'applied' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Applied credit notes cannot be voided.');
    END IF;

    IF v_cn.status = 'voided' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already voided.');
    END IF;

    UPDATE credit_notes SET status = 'voided' WHERE id = p_credit_note_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'void', 'credit_note', p_credit_note_id,
            jsonb_build_object('credit_number', v_cn.credit_number));

    RETURN jsonb_build_object('success', true, 'credit_note_id', p_credit_note_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION void_credit_note_draft(UUID, UUID, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 8. decide_approval_request — void_payment + apply_credit_note ─

CREATE OR REPLACE FUNCTION decide_approval_request(
    p_request_id    UUID,
    p_school_id     UUID,
    p_decision      TEXT,
    p_decider_id    UUID    DEFAULT NULL,
    p_decider_email TEXT    DEFAULT NULL,
    p_note          TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_req      approval_requests%ROWTYPE;
    v_applied  BOOLEAN := false;
    v_entity   UUID;
    v_payload  JSONB;
    v_result   JSONB;
    v_reason   TEXT;
BEGIN
    IF p_decision NOT IN ('approve', 'reject') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid decision.');
    END IF;

    SELECT * INTO v_req
      FROM approval_requests
     WHERE id = p_request_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found.');
    END IF;

    IF v_req.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request already decided.');
    END IF;

    IF v_req.requested_by_id IS NOT NULL
       AND p_decider_id IS NOT NULL
       AND v_req.requested_by_id = p_decider_id THEN
        RETURN jsonb_build_object('success', false,
            'error', 'You can''t approve your own request — a different administrator must review it.');
    END IF;

    v_entity := CASE
        WHEN v_req.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN v_req.target_id::uuid ELSE NULL END;

    v_payload := CASE
        WHEN v_req.payload IS NULL THEN '{}'::jsonb
        WHEN jsonb_typeof(v_req.payload) = 'object' THEN v_req.payload
        WHEN jsonb_typeof(v_req.payload) = 'string' THEN (v_req.payload #>> '{}')::jsonb
        ELSE '{}'::jsonb
    END;

    IF p_decision = 'reject' THEN
        UPDATE approval_requests
           SET status = 'rejected', decided_by = p_decider_email,
               decided_at = now(), decision_note = p_note
         WHERE id = p_request_id;

        INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
        VALUES (p_school_id, p_decider_id, p_decider_email, 'approval_rejected',
                COALESCE(v_req.target_type, 'request'), v_entity,
                jsonb_build_object('action_type', v_req.action_type, 'request_id', p_request_id));

        RETURN jsonb_build_object('success', true, 'decision', 'rejected');
    END IF;

    IF v_req.action_type = 'cancel_invoice' AND v_req.target_id IS NOT NULL THEN
        UPDATE invoices
           SET status = 'cancelled', updated_at = now()
         WHERE id = v_req.target_id::uuid AND school_id = p_school_id;
        v_applied := true;

    ELSIF v_req.action_type = 'assign_discount' AND v_req.target_id IS NOT NULL THEN
        UPDATE student_discounts
           SET status = 'approved'
         WHERE id = v_req.target_id::uuid;
        v_applied := true;

    ELSIF v_req.action_type = 'void_payment' AND v_req.target_id IS NOT NULL THEN
        v_reason := COALESCE(NULLIF(TRIM(v_payload->>'reason'), ''), 'Approved void');
        v_result := void_payment(
            v_req.target_id::uuid, p_school_id, v_reason,
            p_decider_id, p_decider_email,
            COALESCE((v_payload->>'same_day_only')::boolean, false)
        );
        IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false,
                'error', COALESCE(v_result->>'error', 'Void payment failed.'));
        END IF;
        v_applied := true;

    ELSIF v_req.action_type = 'apply_credit_note' AND v_req.target_id IS NOT NULL THEN
        v_result := apply_credit_note(
            v_req.target_id::uuid, p_school_id, p_decider_id, p_decider_email
        );
        IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false,
                'error', COALESCE(v_result->>'error', 'Apply credit note failed.'));
        END IF;
        v_applied := true;
    END IF;

    IF NOT v_applied THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Unknown action type — nothing was changed.');
    END IF;

    UPDATE approval_requests
       SET status = 'approved', decided_by = p_decider_email,
           decided_at = now(), decision_note = p_note
     WHERE id = p_request_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_decider_id, p_decider_email, v_req.action_type,
            COALESCE(v_req.target_type, 'request'), v_entity,
            jsonb_build_object('via', 'approval', 'request_id', p_request_id,
                               'approved_by', p_decider_email));

    RETURN jsonb_build_object('success', true, 'decision', 'approved',
                              'action_type', v_req.action_type);
END;
$fn$;

GRANT EXECUTE ON FUNCTION decide_approval_request(UUID, UUID, TEXT, UUID, TEXT, TEXT)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION void_payment IS
    'Same-day (default) payment void: reverses invoice paid_amount, student credit overpay, marks payment voided, posts GL reverse.';
COMMENT ON FUNCTION apply_credit_note IS
    'Applies a draft/approved credit note: negative invoice line, reduces bill / adds student credit_balance. No cash refund.';
