-- ─────────────────────────────────────────────────────────────────
-- Migration 122: void_expense() + approval wiring
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- Deleting an expense was a one-click hard delete with no reason and no
-- second pair of eyes — on a money line that is already in the books.
-- Payments got a proper void in 111/112; expenses get the same here.
--
-- WHAT
--   • void_expense()  — records the reason + the line's details in
--     audit_logs, then removes the row. The ledger trigger from mig. 104
--     (AFTER DELETE) posts the reversing entry, so the books keep the trail:
--     original → reversal.
--   • decide_approval_request() — gains a 'void_expense' branch so a bursar's
--     request is executed by the approving admin, same as void_payment.
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

-- ── 1. void_expense ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION void_expense(
    p_school_id  UUID,
    p_expense_id UUID,
    p_reason     TEXT,
    p_user_id    UUID DEFAULT NULL,
    p_user_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_row    expenses%ROWTYPE;
    v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
    IF v_reason IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A reason is required to void an expense.');
    END IF;

    SELECT * INTO v_row
      FROM expenses
     WHERE id = p_expense_id AND school_id = p_school_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Expense not found.');
    END IF;

    -- The audit line carries everything the row had, so the void is
    -- reconstructible after the row is gone.
    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'void_expense', 'expense', v_row.id,
            jsonb_build_object(
                'reason',         v_reason,
                'description',    v_row.description,
                'amount',         v_row.amount,
                'expense_date',   v_row.expense_date,
                'category_id',    v_row.category_id,
                'payment_method', v_row.payment_method,
                'invoice_number', v_row.invoice_number,
                'vendor_name',    v_row.vendor_name
            ));

    -- trg_ledger_expense (mig. 104) fires AFTER DELETE and posts the reversal.
    DELETE FROM expenses WHERE id = v_row.id;

    RETURN jsonb_build_object('success', true, 'expense_id', v_row.id,
                              'amount', v_row.amount, 'description', v_row.description);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$fn$;

GRANT EXECUTE ON FUNCTION void_expense(UUID, UUID, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION void_expense IS
    'Void an expense with a recorded reason; the ledger reversal is posted by the delete trigger from migration 104.';

-- ── 2. decide_approval_request — add void_expense ────────────────
-- Full redefinition (same body as 113) plus the new branch.

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

    ELSIF v_req.action_type = 'void_expense' AND v_req.target_id IS NOT NULL THEN
        v_reason := COALESCE(NULLIF(TRIM(v_payload->>'reason'), ''), 'Approved void');
        v_result := void_expense(
            p_school_id, v_req.target_id::uuid, v_reason,
            p_decider_id, p_decider_email
        );
        IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false,
                'error', COALESCE(v_result->>'error', 'Void expense failed.'));
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
