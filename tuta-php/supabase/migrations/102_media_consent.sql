-- ─────────────────────────────────────────────────────────────────
-- Migration 102: Image / media consent at admission
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor, AFTER migration 101.
-- After running: Settings → API → Reload Schema Cache.
--
-- WHY
-- Rules-and-regulations consent is already captured on the admit form
-- (consent_accepted/name/at + rules_version + source_ip). Image/media consent
-- is a SEPARATE processing purpose and under the Data Protection Act 2019 must
-- be captured separately, specifically, and not as a condition of admission
-- (see "The School as an Organization" §11 — consent as data on the Guardian
-- and Student, per purpose).
--
-- Three-way, deliberate choice made by the guardian at admission:
--   'none'     — no photos/video of the child
--   'internal' — internal use only (report cards, classroom, school records)
--   'public'   — internal + public (school website, social media, marketing)
-- NULL = not on record (existing learners admitted before this feature).
--
-- Consent lives on the person: it is captured on the admission and carried onto
-- the student when admit_applicant runs, so the office can see and later revise
-- it. This migration also re-defines admit_applicant (from mig. 101) to copy it.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE admissions
    ADD COLUMN IF NOT EXISTS media_consent TEXT
    CHECK (media_consent IN ('none', 'internal', 'public'));

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS media_consent TEXT
    CHECK (media_consent IN ('none', 'internal', 'public'));

-- Re-define admit_applicant (mig. 101) to carry media_consent onto the student.
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
        admission_date, admission_number, status, media_consent
    ) VALUES (
        v_student_id, p_school_id, v_adm.first_name, v_adm.last_name,
        NULLIF(v_adm.gender, ''), v_adm.dob, p_class_id,
        NULLIF(v_adm.guardian_name, ''), NULLIF(v_adm.guardian_phone, ''),
        NULLIF(v_adm.previous_school, ''),
        CURRENT_DATE, NULL, 'active', v_adm.media_consent
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
