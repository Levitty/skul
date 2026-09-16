-- ─────────────────────────────────────────────────────────────────
-- Migration 101: admit_applicant() — turning an applicant into a student
--                as one governed Action (ontology Step 2).
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- WHY THIS EXISTS
-- Approving an admission (modules/admissions.php) did its work as two loose
-- writes in PHP: INSERT the student, then UPDATE the admission to 'approved'.
-- If the process died between them, a student existed while the admission still
-- read 'pending' — and re-approving created the SAME child twice. The admission
-- was also never written to audit_logs, so "who admitted this learner, when?"
-- had no answer in the record.
--
-- This RPC makes admission ONE atomic, self-auditing action — the same
-- discipline as record_payment (058) and decide_approval_request (100). It is
-- the ontology's AdmitApplicant action. See ontology/manifest.yaml, spec §06.
--
-- BEHAVIOUR IS UNCHANGED for the user: same screens, same fields, the admission
-- number is still assigned by the existing trigger (mig. 089) when null.
--
-- CONTRACT: returns JSONB { success: bool, error?: text, student_id?: uuid, name?: text }
--           SECURITY DEFINER · takes p_user_id / p_user_email for the audit row.
-- Invariants enforced IN THE DATABASE:
--   • admission exists, belongs to the school, and is still 'pending'
--     (this is the no-duplicate-child guard, now race-proof via FOR UPDATE)
--   • student creation + admission flip + audit line commit as one unit
--
-- Safe to run multiple times (CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admit_applicant(
    p_admission_id  UUID,
    p_school_id     UUID,
    p_class_id      UUID    DEFAULT NULL,
    p_user_id       UUID    DEFAULT NULL,
    p_user_email    TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_adm        admissions%ROWTYPE;
    v_student_id UUID := gen_random_uuid();
BEGIN
    -- Lock the admission so it can't be approved twice at the same moment.
    SELECT * INTO v_adm
      FROM admissions
     WHERE id = p_admission_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admission not found.');
    END IF;

    IF v_adm.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admission already processed.');
    END IF;

    -- Create the student. admission_number left NULL → the existing trigger
    -- (mig. 089) assigns the next gap-free per-school number. Empty optional
    -- text fields are normalised to NULL, matching the previous PHP ( ?: null ).
    INSERT INTO students (
        id, school_id, first_name, last_name, gender, dob,
        current_class_id, guardian_name, guardian_phone, previous_school_name,
        admission_date, admission_number, status
    ) VALUES (
        v_student_id, p_school_id, v_adm.first_name, v_adm.last_name,
        NULLIF(v_adm.gender, ''), v_adm.dob, p_class_id,
        NULLIF(v_adm.guardian_name, ''), NULLIF(v_adm.guardian_phone, ''),
        NULLIF(v_adm.previous_school, ''),
        CURRENT_DATE, NULL, 'active'
    );

    -- Flip the admission and link it to the new student.
    UPDATE admissions
       SET status = 'approved',
           reviewed_at = now(),
           reviewed_by = COALESCE(p_user_email, 'staff'),
           created_student_id = v_student_id
     WHERE id = p_admission_id;

    -- Record the event (the old path logged nothing for admissions).
    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'admit', 'student', v_student_id,
            jsonb_build_object('admission_id', p_admission_id,
                               'name', concat_ws(' ', v_adm.first_name, v_adm.last_name)));

    RETURN jsonb_build_object('success', true,
                              'student_id', v_student_id,
                              'name', concat_ws(' ', v_adm.first_name, v_adm.last_name));
END;
$fn$;
