-- ─────────────────────────────────────────────────────────────────
-- Migration 113: create_one_off_charge() — bill an ad-hoc item to a
--                chosen set of learners, as one governed action.
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- Invoicing today assumes a recurring fee schedule (fee_groups). There was no
-- way to say "bill these 40 learners KES 2,500 for the Grade 5 trip" — the
-- common real case: trips, exam fees, a replacement book, remedial classes,
-- a fundraiser. Staff worked around it by adding lines to invoices one at a
-- time, or by re-running fee generation with an Activity ticked.
--
-- MODES
--   'separate' — each learner gets their own CHG- invoice (default; easiest
--                to see what the trip collected).
--   'merge'    — the line is added to the learner's existing open invoice for
--                the term when there is one, so the family gets a single bill;
--                falls back to a new invoice when there isn't.
--
-- IDEMPOTENT: a learner already carrying a line with this exact description in
-- this term is skipped, so re-running can never double-bill.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_one_off_charge(
    p_school_id        UUID,
    p_student_ids      JSONB,
    p_description      TEXT,
    p_amount           NUMERIC,
    p_term_id          UUID,
    p_academic_year_id UUID,
    p_due_date         DATE    DEFAULT NULL,
    p_mode             TEXT    DEFAULT 'separate',
    p_status           TEXT    DEFAULT 'unpaid',
    p_user_id          UUID    DEFAULT NULL,
    p_user_email       TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_txt        TEXT;
    v_student    UUID;
    v_desc       TEXT := btrim(p_description);
    v_billed     INT  := 0;
    v_skipped    INT  := 0;
    v_merged     INT  := 0;
    v_created    INT  := 0;
    v_invoice    UUID;
    v_ref        TEXT;
    v_total      NUMERIC(12,2);
BEGIN
    IF v_desc IS NULL OR v_desc = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'A description is required.');
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A positive amount is required.');
    END IF;
    IF p_academic_year_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No current academic year is set.');
    END IF;
    IF p_status NOT IN ('draft', 'unpaid') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid invoice status.');
    END IF;

    FOR v_txt IN SELECT jsonb_array_elements_text(COALESCE(p_student_ids, '[]'::jsonb)) LOOP
        v_student := v_txt::uuid;
        v_invoice := NULL;

        -- Belongs to this school and still active?
        IF NOT EXISTS (SELECT 1 FROM students
                        WHERE id = v_student AND school_id = p_school_id AND status = 'active') THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Already charged this exact thing this term? Don't bill twice.
        IF EXISTS (
            SELECT 1 FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            WHERE i.school_id = p_school_id
              AND i.student_id = v_student
              AND i.term_id IS NOT DISTINCT FROM p_term_id
              AND i.status <> 'cancelled'
              AND lower(btrim(ii.description)) = lower(v_desc)
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Merge mode: reuse an open invoice for the term if one exists.
        IF p_mode = 'merge' THEN
            SELECT id INTO v_invoice
              FROM invoices
             WHERE school_id = p_school_id AND student_id = v_student
               AND term_id IS NOT DISTINCT FROM p_term_id
               AND status IN ('draft', 'unpaid', 'partial', 'overdue')
             ORDER BY created_at DESC
             LIMIT 1;
        END IF;

        IF v_invoice IS NULL THEN
            -- Own invoice. CHG- prefix distinguishes it from fee (INV-) and
            -- activity (ACT-) invoices at a glance.
            v_invoice := gen_random_uuid();
            v_ref := 'CHG-' || upper(substr(replace(v_invoice::text, '-', ''), 1, 8));

            INSERT INTO invoices (
                id, school_id, student_id, academic_year_id, fee_group_id, term_id,
                reference, amount, paid_amount, status, due_date, issued_at
            ) VALUES (
                v_invoice, p_school_id, v_student, p_academic_year_id, NULL, p_term_id,
                v_ref, p_amount, 0, p_status, p_due_date,
                CASE WHEN p_status = 'unpaid' THEN now() ELSE NULL END
            );
            v_created := v_created + 1;
        ELSE
            v_merged := v_merged + 1;
        END IF;

        INSERT INTO invoice_items (invoice_id, description, amount)
        VALUES (v_invoice, v_desc, p_amount);

        -- Always recompute from the lines so contra/discount rows stay correct.
        SELECT COALESCE(sum(amount), 0) INTO v_total FROM invoice_items WHERE invoice_id = v_invoice;
        IF v_total < 0 THEN v_total := 0; END IF;
        UPDATE invoices SET amount = round(v_total, 2), updated_at = now() WHERE id = v_invoice;

        v_billed := v_billed + 1;
    END LOOP;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'one_off_charge', 'invoice', NULL,
            jsonb_build_object('description', v_desc, 'amount', p_amount, 'mode', p_mode,
                               'term_id', p_term_id, 'billed', v_billed, 'skipped', v_skipped,
                               'new_invoices', v_created, 'merged', v_merged));

    RETURN jsonb_build_object('success', true, 'billed', v_billed, 'skipped', v_skipped,
                              'new_invoices', v_created, 'merged', v_merged,
                              'total', round(p_amount * v_billed, 2));
END;
$fn$;
