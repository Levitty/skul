-- ─────────────────────────────────────────────────────────────────
-- Migration 107: set_student_status() — deactivate / restore learners as
--                one governed batch Action (ontology Step 2).
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- Removing a learner is (correctly) a SOFT status change — status 'exited', never
-- a hard delete — and restoring flips it back to 'active'. But the three paths in
-- modules/students/list.php (single deactivate, bulk deactivate, restore) each did
-- a raw update, and bulk_delete carried a literal note: "No deactivate_students_batch
-- RPC exists in this database." This is that RPC. It handles all three via p_status,
-- in one transaction, and writes a single audit line — so a bulk deactivate is
-- all-or-nothing and always recorded. Realises DeactivateStudent + RestoreStudent.
--
-- CONTRACT: returns JSONB { success: bool, error?: text, count: int }
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_student_status(
    p_school_id   UUID,
    p_student_ids JSONB,          -- array of student uuid strings
    p_status      TEXT,           -- 'active' (restore) | 'exited' (deactivate)
    p_user_id     UUID    DEFAULT NULL,
    p_user_email  TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_count INT := 0;
BEGIN
    IF p_status NOT IN ('active', 'exited') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid status.');
    END IF;

    UPDATE students
       SET status = p_status, updated_at = now()
     WHERE school_id = p_school_id
       AND id IN (SELECT j::uuid FROM jsonb_array_elements_text(COALESCE(p_student_ids, '[]'::jsonb)) AS t(j));

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email,
            CASE WHEN p_status = 'active' THEN 'reactivate' ELSE 'deactivate' END,
            'student', NULL,
            jsonb_build_object('status', p_status, 'student_ids', p_student_ids, 'count', v_count));

    RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$fn$;
