-- ─────────────────────────────────────────────────────────────────
-- Migration 111: a second guardian contact per learner
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- Many families want both parents (or a parent and a guardian) to receive fee
-- reminders and school notices. The students table only carried one
-- guardian_name / guardian_phone. student_parents exists but links PORTAL
-- LOGIN accounts (auth.users), not phone contacts — so it cannot serve this.
--
-- This adds a plain second contact alongside the first. SMS sends to both when
-- present; everything else is unchanged and the columns are optional.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS guardian_name_2  TEXT,
    ADD COLUMN IF NOT EXISTS guardian_phone_2 TEXT,
    ADD COLUMN IF NOT EXISTS guardian_relation_2 TEXT;

-- The parent-facing admission form collects the same pair, so a separated
-- family can declare both contacts at the point of application.
ALTER TABLE admissions
    ADD COLUMN IF NOT EXISTS guardian_name_2  TEXT,
    ADD COLUMN IF NOT EXISTS guardian_phone_2 TEXT,
    ADD COLUMN IF NOT EXISTS guardian_relation_2 TEXT;

-- Carry the second guardian through when an applicant becomes a student
-- (re-defines admit_applicant from migrations 101/102 — same contract).
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

    INSERT INTO students (
        id, school_id, first_name, last_name, gender, dob,
        current_class_id, guardian_name, guardian_phone, previous_school_name,
        admission_date, admission_number, status, media_consent,
        guardian_name_2, guardian_phone_2, guardian_relation_2
    ) VALUES (
        v_student_id, p_school_id, v_adm.first_name, v_adm.last_name,
        NULLIF(v_adm.gender, ''), v_adm.dob, p_class_id,
        NULLIF(v_adm.guardian_name, ''), NULLIF(v_adm.guardian_phone, ''),
        NULLIF(v_adm.previous_school, ''),
        CURRENT_DATE, NULL, 'active', v_adm.media_consent,
        NULLIF(v_adm.guardian_name_2, ''), NULLIF(v_adm.guardian_phone_2, ''),
        NULLIF(v_adm.guardian_relation_2, '')
    );

    UPDATE admissions
       SET status = 'approved',
           reviewed_at = now(),
           reviewed_by = COALESCE(p_user_email, 'staff'),
           created_student_id = v_student_id
     WHERE id = p_admission_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'admit', 'student', v_student_id,
            jsonb_build_object('admission_id', p_admission_id,
                               'name', concat_ws(' ', v_adm.first_name, v_adm.last_name),
                               'media_consent', v_adm.media_consent));

    RETURN jsonb_build_object('success', true,
                              'student_id', v_student_id,
                              'name', concat_ws(' ', v_adm.first_name, v_adm.last_name));
END;
$fn$;
