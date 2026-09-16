-- ─────────────────────────────────────────────────────────────────
-- Migration 100: decide_approval_request() — the maker-checker decision
--                as one governed Action (ontology Step 2).
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- WHY THIS EXISTS
-- Until now, approving a request (modules/approvals.php) did its work as three
-- separate raw writes in PHP: check maker≠checker, UPDATE the target row, then
-- UPDATE the approval_requests row — with the audit line written afterwards.
-- If the process died between the two UPDATEs, a discount could bill while its
-- request still read "pending", or vice-versa.
--
-- This RPC makes the decision ONE atomic, permission-checked, self-auditing
-- action — the same discipline as record_payment (mig. 058). It is the
-- realisation of the ontology's ApproveDiscount action (and the sibling
-- cancel_invoice), routed through a single governed write path. See
-- ontology/manifest.yaml and "The Tuta Ontology" §06.
--
-- CONTRACT (matches the codebase's record_payment convention)
--   returns JSONB { success: bool, error?: text, decision?: text, action_type?: text }
--   SECURITY DEFINER · takes decider id/email for the audit row.
--
-- Invariants enforced IN THE DATABASE (no longer only in the UI):
--   • request exists, belongs to the school, and is still 'pending'
--   • the approver is not the requester (maker ≠ checker)
--   • the whole decision commits or rolls back as a unit (row locked FOR UPDATE)
--
-- Safe to run multiple times (CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decide_approval_request(
    p_request_id    UUID,
    p_school_id     UUID,
    p_decision      TEXT,                 -- 'approve' | 'reject'
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
BEGIN
    IF p_decision NOT IN ('approve', 'reject') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid decision.');
    END IF;

    -- Lock the request so two administrators can't decide it at once.
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

    -- Invariant: the requester may not approve their own request.
    IF v_req.requested_by_id IS NOT NULL
       AND p_decider_id IS NOT NULL
       AND v_req.requested_by_id = p_decider_id THEN
        RETURN jsonb_build_object('success', false,
            'error', 'You can''t approve your own request — a different administrator must review it.');
    END IF;

    -- target_id is TEXT; keep a UUID form for the audit entity_id when it is one.
    v_entity := CASE
        WHEN v_req.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN v_req.target_id::uuid ELSE NULL END;

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

    -- ── approve: execute the gated action, then flip the request ──────────
    IF v_req.action_type = 'cancel_invoice' AND v_req.target_id IS NOT NULL THEN
        UPDATE invoices
           SET status = 'cancelled', updated_at = now()
         WHERE id = v_req.target_id::uuid AND school_id = p_school_id;
        v_applied := true;

    ELSIF v_req.action_type = 'assign_discount' AND v_req.target_id IS NOT NULL THEN
        -- flip the pending student_discount to approved → it now bills on the
        -- next invoice generation for that student
        UPDATE student_discounts
           SET status = 'approved'
         WHERE id = v_req.target_id::uuid;
        v_applied := true;
    END IF;

    IF NOT v_applied THEN
        -- unknown action_type: roll back by raising (nothing has committed yet)
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
