-- ─────────────────────────────────────────────────────────────────
-- Migration 059: Atomic generate_invoices_for_class RPC
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- Replaces the slow PHP bulk-generate loop (which made ~360 HTTP
-- round trips for 30 students). This function does the entire batch
-- in ONE database call.
--
-- For each student in the input array, it:
--   1. Skips if an invoice already exists for (student, fee_group, term).
--   2. Sums fee_group line items (prorated if proration_percent < 100).
--   3. Adds transport fee (if route selected).
--   4. Adds activity fees (if activity_ids selected).
--   5. Sums unpaid balances from previous-term invoices → carry-forward.
--      Marks those source invoices as 'carried_forward' (atomic).
--   6. Auto-applies the student's credit_balance.
--   7. Inserts the invoice + all line items.
--   8. If credit was applied, also inserts a payment row with method='credit_balance'.
--
-- Per-student errors are caught inside an EXCEPTION block — if one
-- student fails, the rest still succeed. The function returns counts
-- and detailed lists of skipped/failed students.
--
-- Default p_status = 'draft' (matches the new draft-then-issue flow).
-- Pass p_status = 'unpaid' to issue immediately.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_invoices_for_class(
    p_school_id      UUID,
    p_class_id       UUID,
    p_fee_group_id   UUID,
    p_term_id        UUID,
    p_due_date       DATE    DEFAULT NULL,
    p_user_id        UUID    DEFAULT NULL,
    p_user_email     TEXT    DEFAULT NULL,
    p_students       JSONB   DEFAULT '[]'::jsonb,
    p_invoice_prefix TEXT    DEFAULT 'INV',
    p_status         TEXT    DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    -- Per-student vars (reset each iteration)
    v_student         JSONB;
    v_student_id      UUID;
    v_transport_id    UUID;
    v_activity_ids    JSONB;
    v_proration       NUMERIC(5,2);
    v_invoice_id      UUID;
    v_reference       TEXT;
    v_base_total      NUMERIC(12,2);
    v_transport_fee   NUMERIC(12,2);
    v_activities_fee  NUMERIC(12,2);
    v_carry_total     NUMERIC(12,2);
    v_invoice_total   NUMERIC(12,2);
    v_credit_avail    NUMERIC(12,2);
    v_credit_apply    NUMERIC(12,2);
    v_initial_paid    NUMERIC(12,2);
    v_initial_status  TEXT;
    v_carry_invoice   RECORD;
    v_carry_sources   UUID[];
    v_first_source    UUID;
    v_academic_year   UUID;

    -- Pre-fetched data (one query each, then reused)
    v_fee_items       JSONB;
    v_transport_map   JSONB;
    v_activity_map    JSONB;
    v_base_schedule   NUMERIC(12,2);

    -- Batch totals
    v_generated       INT := 0;
    v_skipped         INT := 0;
    v_failed          INT := 0;
    v_carry_total_all NUMERIC(12,2) := 0;
    v_credits_total   NUMERIC(12,2) := 0;
    v_credits_count   INT := 0;
    v_invoice_ids     UUID[] := ARRAY[]::UUID[];
    v_skipped_arr     JSONB := '[]'::jsonb;
    v_failed_arr      JSONB := '[]'::jsonb;
BEGIN
    -- ── 1. Validate inputs ────────────────────────────────────────
    IF p_school_id IS NULL OR p_fee_group_id IS NULL OR p_term_id IS NULL THEN
        RAISE EXCEPTION 'school_id, fee_group_id, and term_id are required';
    END IF;

    IF p_status NOT IN ('draft', 'unpaid') THEN
        RAISE EXCEPTION 'p_status must be draft or unpaid (got: %)', p_status;
    END IF;

    IF jsonb_typeof(p_students) != 'array' OR jsonb_array_length(p_students) = 0 THEN
        RAISE EXCEPTION 'p_students must be a non-empty array';
    END IF;

    -- ── 2. Tenant safety: fee_group must belong to the school ────
    SELECT academic_year_id INTO v_academic_year
    FROM fee_groups
    WHERE id = p_fee_group_id AND school_id = p_school_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fee group does not belong to this school';
    END IF;

    -- ── 3. Pre-fetch fee group items (batch) ─────────────────────
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fee_head_id', fgi.fee_head_id,
        'amount',      fgi.amount,
        'name',        fh.name,
        'category',    fh.category
    )), '[]'::jsonb)
    INTO v_fee_items
    FROM fee_group_items fgi
    JOIN fee_heads fh ON fh.id = fgi.fee_head_id
    WHERE fgi.fee_group_id = p_fee_group_id;

    IF jsonb_array_length(v_fee_items) = 0 THEN
        RAISE EXCEPTION 'Fee group has no items configured';
    END IF;

    SELECT COALESCE(SUM((item->>'amount')::NUMERIC), 0)
    INTO v_base_schedule
    FROM jsonb_array_elements(v_fee_items) AS item;

    -- ── 4. Pre-fetch transport routes (one query) ────────────────
    SELECT COALESCE(jsonb_object_agg(id::TEXT, jsonb_build_object(
        'name',         name,
        'route_number', route_number,
        'fee_amount',   fee_amount
    )), '{}'::jsonb)
    INTO v_transport_map
    FROM transport_routes
    WHERE school_id = p_school_id;

    -- ── 5. Pre-fetch activities (one query) ──────────────────────
    SELECT COALESCE(jsonb_object_agg(id::TEXT, jsonb_build_object(
        'name',       name,
        'fee_amount', fee_amount
    )), '{}'::jsonb)
    INTO v_activity_map
    FROM activities
    WHERE school_id = p_school_id;

    -- ── 6. Loop over students (each in its own savepoint) ───────
    FOR v_student IN SELECT * FROM jsonb_array_elements(p_students) LOOP
        v_student_id   := (v_student->>'student_id')::UUID;
        v_transport_id := NULLIF(v_student->>'transport_route_id', '')::UUID;
        v_activity_ids := COALESCE(v_student->'activity_ids', '[]'::jsonb);
        v_proration    := GREATEST(0, LEAST(100, COALESCE((v_student->>'proration_percent')::NUMERIC, 100)));

        -- Skip if invoice already exists for this (student, group, term)
        IF EXISTS (
            SELECT 1 FROM invoices
            WHERE school_id = p_school_id
              AND student_id = v_student_id
              AND fee_group_id = p_fee_group_id
              AND term_id = p_term_id
              AND status != 'cancelled'
        ) THEN
            v_skipped := v_skipped + 1;
            v_skipped_arr := v_skipped_arr || jsonb_build_object(
                'student_id', v_student_id,
                'reason',     'Invoice already exists for this term'
            );
            CONTINUE;
        END IF;

        -- Per-student work in its own EXCEPTION block (implicit savepoint)
        BEGIN
            v_transport_fee  := 0;
            v_activities_fee := 0;
            v_carry_total    := 0;
            v_carry_sources  := ARRAY[]::UUID[];
            v_first_source   := NULL;

            -- Transport fee
            IF v_transport_id IS NOT NULL AND v_transport_map ? v_transport_id::TEXT THEN
                v_transport_fee := COALESCE((v_transport_map -> v_transport_id::TEXT ->> 'fee_amount')::NUMERIC, 0);
            END IF;

            -- Activity fees (sum across selected activity_ids)
            IF jsonb_array_length(v_activity_ids) > 0 THEN
                SELECT COALESCE(SUM(
                    COALESCE((v_activity_map -> aid ->> 'fee_amount')::NUMERIC, 0)
                ), 0)
                INTO v_activities_fee
                FROM jsonb_array_elements_text(v_activity_ids) AS aid
                WHERE v_activity_map ? aid;
            END IF;

            -- Carry-forward: lock + collect prior unpaid/partial invoices
            FOR v_carry_invoice IN
                SELECT id, amount, paid_amount
                FROM invoices
                WHERE school_id = p_school_id
                  AND student_id = v_student_id
                  AND term_id IS DISTINCT FROM p_term_id
                  AND status IN ('unpaid', 'partial')
                ORDER BY created_at ASC
                FOR UPDATE
            LOOP
                v_carry_total := v_carry_total + GREATEST(0, v_carry_invoice.amount - v_carry_invoice.paid_amount);
                v_carry_sources := array_append(v_carry_sources, v_carry_invoice.id);
                IF v_first_source IS NULL THEN
                    v_first_source := v_carry_invoice.id;
                END IF;
            END LOOP;

            -- Compute total: prorate base only; transport/activities/carry not prorated
            v_base_total    := ROUND(v_base_schedule * (v_proration / 100.0), 2);
            v_invoice_total := v_base_total + v_transport_fee + v_activities_fee + v_carry_total;

            -- Apply student credit balance
            SELECT COALESCE(credit_balance, 0) INTO v_credit_avail
            FROM students WHERE id = v_student_id FOR UPDATE;

            v_credit_apply := LEAST(v_credit_avail, v_invoice_total);
            v_initial_paid := v_credit_apply;

            -- Status logic: drafts always 'draft' regardless of credit
            IF p_status = 'draft' THEN
                v_initial_status := 'draft';
            ELSIF v_credit_apply >= v_invoice_total AND v_invoice_total > 0 THEN
                v_initial_status := 'paid';
            ELSIF v_credit_apply > 0 THEN
                v_initial_status := 'partial';
            ELSE
                v_initial_status := 'unpaid';
            END IF;

            -- Generate unique reference (prefix + 8-char hash)
            v_reference := p_invoice_prefix || '-' || UPPER(SUBSTRING(
                MD5(v_student_id::TEXT || p_fee_group_id::TEXT || EXTRACT(EPOCH FROM CLOCK_TIMESTAMP())::TEXT)
                FROM 1 FOR 8
            ));

            -- INSERT invoice
            INSERT INTO invoices (
                school_id, student_id, academic_year_id, fee_group_id, term_id,
                reference, amount, paid_amount, credit_applied,
                carry_forward_amount, carry_forward_source_id,
                status, due_date, issued_at
            ) VALUES (
                p_school_id, v_student_id, v_academic_year, p_fee_group_id, p_term_id,
                v_reference, v_invoice_total, v_initial_paid, v_credit_apply,
                v_carry_total, v_first_source,
                v_initial_status, p_due_date,
                CASE WHEN p_status = 'unpaid' THEN NOW() ELSE NULL END
            )
            RETURNING id INTO v_invoice_id;

            -- INSERT fee head line items (prorated)
            INSERT INTO invoice_items (invoice_id, description, amount, fee_head_id)
            SELECT
                v_invoice_id,
                CASE WHEN v_proration < 100
                     THEN (item->>'name') || ' (' || v_proration::TEXT || '%)'
                     ELSE item->>'name'
                END,
                ROUND((item->>'amount')::NUMERIC * (v_proration / 100.0), 2),
                (item->>'fee_head_id')::UUID
            FROM jsonb_array_elements(v_fee_items) AS item;

            -- INSERT transport line item
            IF v_transport_fee > 0 AND v_transport_id IS NOT NULL THEN
                INSERT INTO invoice_items (invoice_id, description, amount)
                VALUES (
                    v_invoice_id,
                    'Transport — ' || (v_transport_map -> v_transport_id::TEXT ->> 'name')
                        || COALESCE(' (' || NULLIF(v_transport_map -> v_transport_id::TEXT ->> 'route_number', '') || ')', ''),
                    v_transport_fee
                );
            END IF;

            -- INSERT activity line items
            IF jsonb_array_length(v_activity_ids) > 0 THEN
                INSERT INTO invoice_items (invoice_id, description, amount)
                SELECT
                    v_invoice_id,
                    'Activity — ' || (v_activity_map -> aid ->> 'name'),
                    COALESCE((v_activity_map -> aid ->> 'fee_amount')::NUMERIC, 0)
                FROM jsonb_array_elements_text(v_activity_ids) AS aid
                WHERE v_activity_map ? aid;
            END IF;

            -- INSERT carry-forward line item + mark sources
            IF v_carry_total > 0 THEN
                INSERT INTO invoice_items (invoice_id, description, amount)
                VALUES (
                    v_invoice_id,
                    'Brought forward from previous invoice(s)',
                    v_carry_total
                );

                UPDATE invoices
                   SET status     = 'carried_forward',
                       updated_at = NOW()
                 WHERE id = ANY(v_carry_sources);
            END IF;

            -- Apply credit balance: deduct from student + insert payment row
            IF v_credit_apply > 0 THEN
                UPDATE students
                   SET credit_balance = COALESCE(credit_balance, 0) - v_credit_apply,
                       updated_at     = NOW()
                 WHERE id = v_student_id;

                INSERT INTO payments (
                    invoice_id, school_id, amount, method, transaction_ref,
                    status, paid_at, payment_date
                ) VALUES (
                    v_invoice_id, p_school_id, v_credit_apply, 'credit_balance',
                    NULL,  -- intentionally NULL — credits aren't real txn refs
                    'completed', NOW(), CURRENT_DATE
                );

                v_credits_total := v_credits_total + v_credit_apply;
                v_credits_count := v_credits_count + 1;
            END IF;

            v_carry_total_all := v_carry_total_all + v_carry_total;
            v_invoice_ids := array_append(v_invoice_ids, v_invoice_id);
            v_generated := v_generated + 1;

        EXCEPTION WHEN OTHERS THEN
            -- Per-student rollback to savepoint, batch continues
            v_failed := v_failed + 1;
            v_failed_arr := v_failed_arr || jsonb_build_object(
                'student_id', v_student_id,
                'error',      SQLERRM
            );
        END;
    END LOOP;

    -- ── 7. Audit log: one entry for the batch ─────────────────────
    INSERT INTO audit_logs (
        school_id, user_id, user_email,
        action, entity_type, entity_id, payload
    ) VALUES (
        p_school_id, p_user_id, p_user_email,
        'bulk_generate', 'invoice_batch', NULL,
        jsonb_build_object(
            'class_id',              p_class_id,
            'fee_group_id',          p_fee_group_id,
            'term_id',               p_term_id,
            'status',                p_status,
            'students_in',           jsonb_array_length(p_students),
            'generated_count',       v_generated,
            'skipped_count',         v_skipped,
            'failed_count',          v_failed,
            'carry_forward_total',   v_carry_total_all,
            'credits_applied_total', v_credits_total,
            'credits_applied_count', v_credits_count
        )
    );

    -- ── 8. Return summary ────────────────────────────────────────
    RETURN jsonb_build_object(
        'success',                v_failed = 0,
        'generated_count',        v_generated,
        'skipped_count',          v_skipped,
        'failed_count',           v_failed,
        'carry_forward_total',    v_carry_total_all,
        'credits_applied_total',  v_credits_total,
        'credits_applied_count',  v_credits_count,
        'invoice_ids',            to_jsonb(v_invoice_ids),
        'skipped',                v_skipped_arr,
        'failed',                 v_failed_arr
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION generate_invoices_for_class(
    UUID, UUID, UUID, UUID, DATE, UUID, TEXT, JSONB, TEXT, TEXT
) TO service_role, authenticated, anon;

COMMENT ON FUNCTION generate_invoices_for_class IS
    'Bulk-generates draft invoices for a class in a target term. '
    'Each invoice = prorated fee schedule + transport + activities + carry-forward, '
    'with student credit auto-applied. All-or-nothing per student; per-student errors '
    'do not abort the batch. Replaces 360+ HTTP roundtrip pattern in PHP bulk-generate.';
