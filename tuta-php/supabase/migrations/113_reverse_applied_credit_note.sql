-- Migration 113: Reverse an applied credit note (undo mistaken billing credit).
-- Complements migration 111 apply_credit_note / void_credit_note_draft.

-- ── 1. Status + applied line tracking ─────────────────────────────

ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS applied_line_item_id UUID;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_status_check;
ALTER TABLE credit_notes
    ADD CONSTRAINT credit_notes_status_check
    CHECK (status IN ('draft', 'approved', 'applied', 'voided', 'reversed'));

-- ── 2. apply_credit_note — store negative line id for reversal ──

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
    v_item_id      UUID;
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

    IF v_cn.status = 'reversed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit note was reversed.');
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

    INSERT INTO invoice_items (invoice_id, description, amount)
    VALUES (v_invoice.id, v_line_desc, -v_c)
    RETURNING id INTO v_item_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_new_amount
      FROM invoice_items WHERE invoice_id = v_invoice.id;
    IF v_new_amount < 0 THEN v_new_amount := 0; END IF;
    v_new_amount := round(v_new_amount, 2);

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
       SET status                = 'applied',
           applied_at            = NOW(),
           amount_to_invoice     = v_to_invoice,
           amount_to_credit      = v_to_credit,
           applied_line_item_id  = v_item_id
     WHERE id = p_credit_note_id;

    BEGIN
        v_lines := '[]'::jsonb;
        IF v_to_invoice > 0 THEN
            v_lines := v_lines || jsonb_build_array(
                jsonb_build_object('code','4100','debit',v_to_invoice,'credit',0,'memo','Credit note — reduce fee income'),
                jsonb_build_object('code','1200','debit',0,'credit',v_to_invoice,'memo','Credit note — reduce receivable'));
        END IF;
        IF v_to_credit > 0 THEN
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
                'new_status', v_new_status,
                'applied_line_item_id', v_item_id
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

-- ── 3. reverse_applied_credit_note ───────────────────────────────

CREATE OR REPLACE FUNCTION reverse_applied_credit_note(
    p_credit_note_id UUID,
    p_school_id      UUID,
    p_reason         TEXT,
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
    v_new_amount   NUMERIC(12,2);
    v_paid         NUMERIC(12,2);
    v_to_invoice   NUMERIC(12,2);
    v_to_credit    NUMERIC(12,2);
    v_new_status   TEXT;
    v_line_desc    TEXT;
    v_item_id      UUID;
    v_student_cred NUMERIC(12,2);
    v_lines        JSONB;
    v_today        DATE := (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A reason is required.');
    END IF;

    SELECT * INTO v_cn
      FROM credit_notes
     WHERE id = p_credit_note_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Credit note not found.');
    END IF;

    IF v_cn.status <> 'applied' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Only applied credit notes can be reversed.');
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
        RETURN jsonb_build_object('success', false,
            'error', 'Cannot reverse a credit on a cancelled or carried-forward invoice.');
    END IF;

    v_c          := round(v_cn.amount, 2);
    v_to_invoice := round(COALESCE(v_cn.amount_to_invoice, 0), 2);
    v_to_credit  := round(COALESCE(v_cn.amount_to_credit, 0), 2);
    v_paid       := COALESCE(v_invoice.paid_amount, 0);

    v_line_desc := COALESCE(NULLIF(TRIM(v_cn.description), ''),
                            'Credit — ' || COALESCE(v_cn.reason_code, 'adjustment'));

    v_item_id := v_cn.applied_line_item_id;

    IF v_item_id IS NOT NULL THEN
        PERFORM 1 FROM invoice_items
         WHERE id = v_item_id AND invoice_id = v_invoice.id AND round(amount, 2) = round(-v_c, 2);
        IF NOT FOUND THEN
            v_item_id := NULL;
        END IF;
    END IF;

    IF v_item_id IS NULL THEN
        SELECT ii.id INTO v_item_id
          FROM invoice_items ii
         WHERE ii.invoice_id = v_invoice.id
           AND round(ii.amount, 2) = round(-v_c, 2)
           AND ii.description = v_line_desc
         ORDER BY ii.created_at DESC NULLS LAST
         LIMIT 1;
    END IF;

    IF v_item_id IS NULL THEN
        SELECT ii.id INTO v_item_id
          FROM invoice_items ii
         WHERE ii.invoice_id = v_invoice.id
           AND round(ii.amount, 2) = round(-v_c, 2)
           AND ii.description ILIKE 'Credit —%'
         ORDER BY ii.created_at DESC NULLS LAST
         LIMIT 1;
    END IF;

    IF v_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Could not find the credit line on this invoice — contact support.');
    END IF;

    IF v_to_credit > 0 THEN
        SELECT COALESCE(credit_balance, 0) INTO v_student_cred
          FROM students
         WHERE id = v_cn.student_id
           FOR UPDATE;

        IF v_student_cred + 0.005 < v_to_credit THEN
            RETURN jsonb_build_object('success', false,
                'error', 'Cannot reverse: part of this credit (' || v_to_credit::text
                    || ') was moved to the student account and has already been used elsewhere.');
        END IF;
    END IF;

    DELETE FROM invoice_items WHERE id = v_item_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_new_amount
      FROM invoice_items WHERE invoice_id = v_invoice.id;
    IF v_new_amount < 0 THEN v_new_amount := 0; END IF;
    v_new_amount := round(v_new_amount, 2);

    v_paid := round(v_paid + v_to_credit, 2);

    IF v_to_credit > 0 THEN
        UPDATE students
           SET credit_balance = GREATEST(0, COALESCE(credit_balance, 0) - v_to_credit),
               updated_at     = NOW()
         WHERE id = v_cn.student_id;
    END IF;

    v_new_status := CASE
        WHEN v_paid <= 0.005 AND v_new_amount > 0.005 THEN
            CASE WHEN v_invoice.status = 'draft' THEN 'draft' ELSE 'unpaid' END
        WHEN v_paid + 0.005 >= v_new_amount THEN 'paid'
        ELSE 'partial'
    END;
    IF v_invoice.status = 'draft' AND v_paid <= 0.005 THEN
        v_new_status := 'draft';
    END IF;

    UPDATE invoices
       SET amount      = v_new_amount,
           paid_amount = v_paid,
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = v_invoice.id;

    UPDATE credit_notes
       SET status               = 'reversed',
           reversed_at          = NOW(),
           applied_line_item_id = NULL
     WHERE id = p_credit_note_id;

    BEGIN
        v_lines := '[]'::jsonb;
        IF v_to_invoice > 0 THEN
            v_lines := v_lines || jsonb_build_array(
                jsonb_build_object('code','4100','debit',0,'credit',v_to_invoice,'memo','Reverse credit note — restore fee income'),
                jsonb_build_object('code','1200','debit',v_to_invoice,'credit',0,'memo','Reverse credit note — restore receivable'));
        END IF;
        IF v_to_credit > 0 THEN
            v_lines := v_lines || jsonb_build_array(
                jsonb_build_object('code','4100','debit',0,'credit',v_to_credit,'memo','Reverse credit note — from student credit'),
                jsonb_build_object('code','2000','debit',v_to_credit,'credit',0,'memo','Reverse student credit on account'));
        END IF;
        IF jsonb_array_length(v_lines) > 0 THEN
            PERFORM post_journal(
                p_school_id, v_today,
                'Reverse credit note ' || v_cn.credit_number,
                'credit_note_reverse', p_credit_note_id, v_lines, p_user_id
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO ledger_errors (school_id, source_type, source_id, error)
        VALUES (p_school_id, 'credit_note_reverse', p_credit_note_id, SQLERRM);
    END;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'reverse', 'credit_note', p_credit_note_id,
            jsonb_build_object(
                'credit_number', v_cn.credit_number,
                'amount', v_c,
                'reason', TRIM(p_reason),
                'amount_to_invoice', v_to_invoice,
                'amount_to_credit', v_to_credit,
                'invoice_id', v_invoice.id,
                'new_invoice_amount', v_new_amount,
                'new_paid_amount', v_paid,
                'new_status', v_new_status,
                'removed_line_item_id', v_item_id
            ));

    RETURN jsonb_build_object(
        'success', true,
        'credit_note_id', p_credit_note_id,
        'credit_number', v_cn.credit_number,
        'invoice_id', v_invoice.id,
        'invoice_amount', v_new_amount,
        'paid_amount', v_paid,
        'invoice_status', v_new_status,
        'balance', GREATEST(0, v_new_amount - v_paid)
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION reverse_applied_credit_note(UUID, UUID, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION reverse_applied_credit_note IS
    'Undoes an applied credit note: removes negative invoice line, restores invoice total/paid, pulls back student credit if any, posts GL reverse.';

-- ── 4. decide_approval_request — reverse_credit_note ─────────────

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

    ELSIF v_req.action_type = 'reverse_credit_note' AND v_req.target_id IS NOT NULL THEN
        v_reason := COALESCE(NULLIF(TRIM(v_payload->>'reason'), ''), 'Approved reversal');
        v_result := reverse_applied_credit_note(
            v_req.target_id::uuid, p_school_id, v_reason,
            p_decider_id, p_decider_email
        );
        IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false,
                'error', COALESCE(v_result->>'error', 'Reverse credit note failed.'));
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
