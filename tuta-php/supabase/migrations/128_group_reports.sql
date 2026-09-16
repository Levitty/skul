-- ─────────────────────────────────────────────────────────────────
-- Migration 128: group_report_data() — the comparisons a group needs
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- One call returns five small, pre-aggregated datasets for every branch in
-- a group, so the Group Reports page compares branches on the things that
-- decide a school's year rather than on vanity totals:
--
--   collections  billed / collected per branch per TERM, aligned by term
--                label ("Term 2 · 2026") so branches can be read side by side
--   arrears      what's still owed, per branch, by age: this term / last
--                term / older — plus the biggest balances group-wide
--   enrolment    active learners per branch, joined this term, and a
--                grade-by-branch grid (class names normalised to a grade)
--   expenses     spend per branch per month (last 6) and top categories
--   attendance   weekly attendance rate per branch (last 8 weeks)
--
-- Aggregation happens here in SQL; the page only renders. Idempotent.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION group_report_data(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'Africa/Nairobi')::date;
    v_schools JSONB; v_collections JSONB; v_arrears JSONB; v_debtors JSONB;
    v_enrol JSONB; v_grades JSONB; v_exp JSONB; v_expcat JSONB; v_att JSONB;
BEGIN
    -- Branches in the group, with each one's current term.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'code', s.code,
               'term_id', t.id, 'term_name', t.name, 'term_start', t.start_date) ORDER BY s.name), '[]'::jsonb)
      INTO v_schools
      FROM school_group_members m
      JOIN schools s ON s.id = m.school_id
      LEFT JOIN LATERAL (SELECT id, name, start_date FROM terms
                          WHERE school_id = s.id AND is_current = true
                          ORDER BY start_date DESC LIMIT 1) t ON true
     WHERE m.group_id = p_group_id;

    -- ── Collections by term ──────────────────────────────────────
    -- Label = the term's name with the year of its start date, so "Term 2"
    -- at two branches lands on the same row.
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_collections FROM (
        SELECT i.school_id,
               t.id AS term_id,
               COALESCE(NULLIF(regexp_replace(t.name, '\s*\d{4}\s*$', ''), ''), t.name) || ' · ' || to_char(t.start_date, 'YYYY') AS label,
               t.start_date,
               round(sum(i.amount), 2) AS billed,
               round(sum(COALESCE(i.paid_amount, 0)), 2) AS collected,
               count(DISTINCT i.student_id) AS learners
          FROM invoices i
          JOIN terms t ON t.id = i.term_id
          JOIN school_group_members m ON m.school_id = i.school_id AND m.group_id = p_group_id
         WHERE i.status NOT IN ('draft', 'cancelled')
           AND t.start_date >= v_today - INTERVAL '18 months'
         GROUP BY i.school_id, t.id, t.name, t.start_date
    ) r;

    -- ── Arrears by age ───────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_arrears FROM (
        SELECT i.school_id,
               CASE
                 WHEN ct.id IS NOT NULL AND i.term_id = ct.id THEN 'current'
                 WHEN t.start_date IS NOT NULL AND ct.start_date IS NOT NULL
                      AND t.start_date < ct.start_date AND t.start_date >= ct.start_date - INTERVAL '5 months' THEN 'previous'
                 ELSE 'older'
               END AS bucket,
               round(sum(i.amount - COALESCE(i.paid_amount, 0)), 2) AS balance,
               count(DISTINCT i.student_id) AS learners
          FROM invoices i
          JOIN school_group_members m ON m.school_id = i.school_id AND m.group_id = p_group_id
          LEFT JOIN terms t  ON t.id = i.term_id
          LEFT JOIN LATERAL (SELECT id, start_date FROM terms WHERE school_id = i.school_id AND is_current = true
                              ORDER BY start_date DESC LIMIT 1) ct ON true
         WHERE i.status IN ('unpaid', 'partial', 'overdue')
           AND i.amount - COALESCE(i.paid_amount, 0) > 0
         GROUP BY i.school_id, 2
    ) r;

    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_debtors FROM (
        SELECT i.school_id, s.id AS student_id,
               concat_ws(' ', s.first_name, s.last_name) AS name,
               s.admission_number,
               c.name AS class_name,
               round(sum(i.amount - COALESCE(i.paid_amount, 0)), 2) AS balance,
               count(*) AS invoices
          FROM invoices i
          JOIN school_group_members m ON m.school_id = i.school_id AND m.group_id = p_group_id
          JOIN students s ON s.id = i.student_id
          LEFT JOIN classes c ON c.id = s.current_class_id
         WHERE i.status IN ('unpaid', 'partial', 'overdue')
           AND i.amount - COALESCE(i.paid_amount, 0) > 0
           AND COALESCE(s.status, 'active') = 'active'
         GROUP BY i.school_id, s.id, s.first_name, s.last_name, s.admission_number, c.name
         ORDER BY 6 DESC
         LIMIT 20
    ) r;

    -- ── Enrolment ────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_enrol FROM (
        SELECT s.school_id,
               count(*) FILTER (WHERE COALESCE(s.status, 'active') = 'active') AS active,
               count(*) FILTER (WHERE COALESCE(s.status, 'active') = 'active'
                                  AND ct.start_date IS NOT NULL AND s.admission_date >= ct.start_date) AS joined_this_term,
               count(*) FILTER (WHERE COALESCE(s.status, 'active') <> 'active'
                                  AND ct.start_date IS NOT NULL AND s.updated_at >= ct.start_date) AS left_this_term,
               count(*) FILTER (WHERE COALESCE(s.status, 'active') = 'active' AND s.gender = 'male')   AS boys,
               count(*) FILTER (WHERE COALESCE(s.status, 'active') = 'active' AND s.gender = 'female') AS girls
          FROM students s
          JOIN school_group_members m ON m.school_id = s.school_id AND m.group_id = p_group_id
          LEFT JOIN LATERAL (SELECT start_date FROM terms WHERE school_id = s.school_id AND is_current = true
                              ORDER BY start_date DESC LIMIT 1) ct ON true
         GROUP BY s.school_id
    ) r;

    -- Grade grid: normalise "Grade 5", "GRADE 5A", "Std 5", "PP1", "Form 2" to one label.
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_grades FROM (
        SELECT s.school_id,
               CASE
                 WHEN c.name ~* '^\s*(pp|pre[- ]?primary)\s*([12])' THEN 'PP' || substring(c.name from '([12])')
                 WHEN c.name ~* '(grade|std|standard|class)\s*(\d{1,2})' THEN 'Grade ' || (regexp_match(c.name, '(grade|std|standard|class)\s*(\d{1,2})', 'i'))[2]
                 WHEN c.name ~* '^\s*(form|f)\s*(\d)' THEN 'Form ' || (regexp_match(c.name, '(form|f)\s*(\d)', 'i'))[2]
                 WHEN c.name ~* '^\s*(baby|play|nursery|kg|kindergarten|reception)' THEN 'Pre-school'
                 ELSE COALESCE(c.name, 'Unassigned')
               END AS grade,
               count(*) AS learners
          FROM students s
          JOIN school_group_members m ON m.school_id = s.school_id AND m.group_id = p_group_id
          LEFT JOIN classes c ON c.id = s.current_class_id
         WHERE COALESCE(s.status, 'active') = 'active'
         GROUP BY s.school_id, 2
    ) r;

    -- ── Expenses ─────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_exp FROM (
        SELECT e.school_id, to_char(date_trunc('month', e.expense_date), 'YYYY-MM') AS month,
               round(sum(e.amount), 2) AS amount, count(*) AS entries
          FROM expenses e
          JOIN school_group_members m ON m.school_id = e.school_id AND m.group_id = p_group_id
         WHERE e.expense_date >= (date_trunc('month', v_today) - INTERVAL '5 months')::date
         GROUP BY e.school_id, 2
    ) r;

    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_expcat FROM (
        SELECT e.school_id, COALESCE(c.name, 'Uncategorised') AS category, round(sum(e.amount), 2) AS amount
          FROM expenses e
          JOIN school_group_members m ON m.school_id = e.school_id AND m.group_id = p_group_id
          LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE e.expense_date >= (date_trunc('month', v_today) - INTERVAL '2 months')::date
         GROUP BY e.school_id, 2
    ) r;

    -- ── Attendance by week ───────────────────────────────────────
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_att FROM (
        SELECT a.school_id, to_char(date_trunc('week', a.date), 'YYYY-MM-DD') AS week,
               sum(a.present_count + a.late_count) AS present,
               sum(a.present_count + a.late_count + a.absent_count) AS total,
               count(*) AS sessions
          FROM attendance_sessions a
          JOIN school_group_members m ON m.school_id = a.school_id AND m.group_id = p_group_id
         WHERE a.date >= v_today - 56
         GROUP BY a.school_id, 2
    ) r;

    RETURN jsonb_build_object(
        'schools', v_schools, 'collections', v_collections,
        'arrears', v_arrears, 'debtors', v_debtors,
        'enrolment', v_enrol, 'grades', v_grades,
        'expenses', v_exp, 'expense_categories', v_expcat,
        'attendance', v_att, 'as_of', v_today
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION group_report_data(UUID) TO service_role, authenticated, anon;
