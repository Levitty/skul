-- ─────────────────────────────────────────────────────────────────
-- Migration 127: group_dashboard_stats() — one call, every branch
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- The group dashboard pulled every invoice of every branch into PHP and
-- summed all-time figures. Slow, and "all-time" is the wrong lens for a
-- director on a Monday. This returns, per branch, the numbers that matter
-- for the branch's OWN current term, in one round trip.
--
-- Per branch:
--   students          active learners
--   term_name         that branch's current term (terms are per school)
--   billed/collected/outstanding   current-term invoices (not draft/cancelled)
--   arrears           balance still open on invoices from EARLIER terms
--   collected_7d      completed payments in the last 7 days
--   expenses_month    spend this calendar month
--   attend_pct / attend_taken   today's attendance, and whether any class took it
--   admissions_pending, reminders_draft, approvals_pending
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION group_dashboard_stats(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_out JSONB := '[]'::jsonb;
    v_s   RECORD;
    v_term_id   UUID;
    v_term_name TEXT;
    v_students  INT;
    v_billed    NUMERIC := 0;
    v_collected NUMERIC := 0;
    v_arrears   NUMERIC := 0;
    v_7d        NUMERIC := 0;
    v_exp       NUMERIC := 0;
    v_present   INT := 0;
    v_total     INT := 0;
    v_adm       INT := 0;
    v_rem       INT := 0;
    v_appr      INT := 0;
    v_today     DATE := (NOW() AT TIME ZONE 'Africa/Nairobi')::date;
BEGIN
    FOR v_s IN
        SELECT s.id, s.name, s.code, COALESCE(s.is_active, true) AS is_active
          FROM school_group_members m
          JOIN schools s ON s.id = m.school_id
         WHERE m.group_id = p_group_id
         ORDER BY s.name
    LOOP
        -- A SELECT INTO that finds nothing leaves the previous branch's values
        -- in place, so clear the term before looking it up.
        v_term_id := NULL; v_term_name := NULL;
        SELECT id, name INTO v_term_id, v_term_name
          FROM terms WHERE school_id = v_s.id AND is_current = true
         ORDER BY start_date DESC LIMIT 1;

        SELECT count(*) INTO v_students
          FROM students WHERE school_id = v_s.id AND COALESCE(status, 'active') = 'active';

        -- This term's invoices.
        SELECT COALESCE(sum(amount), 0), COALESCE(sum(paid_amount), 0)
          INTO v_billed, v_collected
          FROM invoices
         WHERE school_id = v_s.id
           AND status NOT IN ('draft', 'cancelled')
           AND (v_term_id IS NOT NULL AND term_id = v_term_id);

        -- What's still owed from before this term.
        SELECT COALESCE(sum(amount - COALESCE(paid_amount, 0)), 0) INTO v_arrears
          FROM invoices
         WHERE school_id = v_s.id
           AND status IN ('unpaid', 'partial', 'overdue')
           AND (v_term_id IS NULL OR term_id IS DISTINCT FROM v_term_id)
           AND amount - COALESCE(paid_amount, 0) > 0;

        SELECT COALESCE(sum(amount), 0) INTO v_7d
          FROM payments
         WHERE school_id = v_s.id AND status = 'completed'
           AND payment_date >= v_today - 6;

        SELECT COALESCE(sum(amount), 0) INTO v_exp
          FROM expenses
         WHERE school_id = v_s.id
           AND expense_date >= date_trunc('month', v_today)::date
           AND expense_date <= v_today;

        SELECT COALESCE(sum(present_count + late_count), 0), COALESCE(sum(present_count + late_count + absent_count), 0)
          INTO v_present, v_total
          FROM attendance_sessions
         WHERE school_id = v_s.id AND date = v_today;

        SELECT count(*) INTO v_adm  FROM admissions      WHERE school_id = v_s.id AND status = 'pending';
        SELECT count(*) INTO v_rem  FROM fee_reminders   WHERE school_id = v_s.id AND status = 'draft';
        SELECT count(*) INTO v_appr FROM approval_requests WHERE school_id = v_s.id AND status = 'pending';

        v_out := v_out || jsonb_build_object(
            'id', v_s.id, 'name', v_s.name, 'code', v_s.code, 'is_active', v_s.is_active,
            'term_id', v_term_id, 'term_name', v_term_name,
            'students', v_students,
            'billed', round(v_billed, 2), 'collected', round(v_collected, 2),
            'outstanding', round(GREATEST(v_billed - v_collected, 0), 2),
            'arrears', round(v_arrears, 2),
            'collected_7d', round(v_7d, 2),
            'expenses_month', round(v_exp, 2),
            'attend_taken', v_total > 0,
            'attend_pct', CASE WHEN v_total > 0 THEN round(v_present::numeric / v_total * 100, 1) ELSE NULL END,
            'admissions_pending', v_adm, 'reminders_draft', v_rem, 'approvals_pending', v_appr
        );
    END LOOP;

    RETURN v_out;
END;
$fn$;

GRANT EXECUTE ON FUNCTION group_dashboard_stats(UUID) TO service_role, authenticated, anon;
