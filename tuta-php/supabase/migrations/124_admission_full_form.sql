-- ─────────────────────────────────────────────────────────────────
-- Migration 124: the full admission form — identity, parents,
--                emergency contacts, medical
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- The parent-facing form captured a name, a grade and two phone numbers.
-- The paper form every Kenyan school actually uses (Whitestar JSS, Aug 2026)
-- captures the child's identity numbers, father / mother / guardian with ID
-- and occupation, two emergency contacts, and a medical section with the
-- permission to administer medication. A school with a child having an
-- asthma attack needs those answers in front of them.
--
-- WHAT
--   • admissions   — new identity columns + three JSONB snapshots (parents,
--                    emergency_contacts, medical) exactly as the parent typed
--   • students     — identity numbers + nationality
--   • guardians    — id_number, occupation, address (table existed, unused)
--   • emergency_contacts (new), student_medical (new; one row per learner)
--   • admit_applicant() — carries all of it onto the learner
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

-- ── 1. admissions: what the parent submits ────────────────────────
ALTER TABLE admissions
    ADD COLUMN IF NOT EXISTS middle_name        TEXT,
    ADD COLUMN IF NOT EXISTS address            TEXT,
    ADD COLUMN IF NOT EXISTS phone              TEXT,
    ADD COLUMN IF NOT EXISTS nationality        TEXT,
    ADD COLUMN IF NOT EXISTS religion           TEXT,
    ADD COLUMN IF NOT EXISTS assessment_number  TEXT,
    ADD COLUMN IF NOT EXISTS birth_cert_number  TEXT,
    ADD COLUMN IF NOT EXISTS nemis_upi          TEXT,
    ADD COLUMN IF NOT EXISTS parents            JSONB,   -- [{relation,name,id_number,phone,email,occupation,address,is_primary}]
    ADD COLUMN IF NOT EXISTS emergency_contacts JSONB,   -- [{name,relationship,phone}]
    ADD COLUMN IF NOT EXISTS medical            JSONB;   -- {conditions:{asthma:'none|mild|moderate|severe',...}, other, needs_treatment, treatment_details, regular_medication, medication_details, may_administer}

-- ── 2. students: identity ─────────────────────────────────────────
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS nationality        TEXT,
    ADD COLUMN IF NOT EXISTS assessment_number  TEXT,
    ADD COLUMN IF NOT EXISTS birth_cert_number  TEXT,
    ADD COLUMN IF NOT EXISTS nemis_upi          TEXT;

-- ── 3. guardians: the fields the paper form has ───────────────────
ALTER TABLE guardians
    ADD COLUMN IF NOT EXISTS id_number   TEXT,
    ADD COLUMN IF NOT EXISTS occupation  TEXT,
    ADD COLUMN IF NOT EXISTS address     TEXT;
CREATE INDEX IF NOT EXISTS idx_guardians_student ON guardians(student_id);
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_guardians" ON guardians;
CREATE POLICY "srv_guardians" ON guardians FOR ALL USING (true);

-- ── 4. emergency contacts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    relationship TEXT,
    phone        TEXT NOT NULL,
    priority     INT  NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_student ON emergency_contacts(student_id);
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_emergency_contacts" ON emergency_contacts;
CREATE POLICY "srv_emergency_contacts" ON emergency_contacts FOR ALL USING (true);

-- ── 5. medical — one row per learner; sensitive, admin/head only in the UI ──
CREATE TABLE IF NOT EXISTS student_medical (
    student_id          UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    conditions          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"asthma":"mild", "diabetes":"none", ...}
    other_condition     TEXT,
    needs_treatment     BOOLEAN,
    treatment_details   TEXT,
    regular_medication  BOOLEAN,
    medication_details  TEXT,
    may_administer      BOOLEAN,       -- permission to administer medication in an emergency
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_medical_school ON student_medical(school_id);
ALTER TABLE student_medical ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_student_medical" ON student_medical;
CREATE POLICY "srv_student_medical" ON student_medical FOR ALL USING (true);

-- ── 6. admit_applicant — carry everything onto the learner ────────
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
    v_p          JSONB;
    v_primary    JSONB := NULL;
    v_second     JSONB := NULL;
    v_i          INT := 0;
    v_med        JSONB;
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

    -- Which parent is the main contact: the one flagged, else the first.
    IF v_adm.parents IS NOT NULL AND jsonb_typeof(v_adm.parents) = 'array' THEN
        FOR v_p IN SELECT * FROM jsonb_array_elements(v_adm.parents) LOOP
            IF NULLIF(TRIM(COALESCE(v_p->>'name', '')), '') IS NULL THEN CONTINUE; END IF;
            IF COALESCE((v_p->>'is_primary')::boolean, false) AND v_primary IS NULL THEN
                v_primary := v_p;
            END IF;
        END LOOP;
        FOR v_p IN SELECT * FROM jsonb_array_elements(v_adm.parents) LOOP
            IF NULLIF(TRIM(COALESCE(v_p->>'name', '')), '') IS NULL THEN CONTINUE; END IF;
            IF v_primary IS NULL THEN v_primary := v_p;
            ELSIF v_second IS NULL AND v_p <> v_primary THEN v_second := v_p;
            END IF;
        END LOOP;
    END IF;

    INSERT INTO students (
        id, school_id, first_name, last_name, middle_name, gender, dob,
        address, phone, nationality, religion,
        assessment_number, birth_cert_number, nemis_upi,
        current_class_id, previous_school_name,
        admission_date, admission_number, status, media_consent,
        guardian_name, guardian_phone,
        guardian_name_2, guardian_phone_2, guardian_relation_2
    ) VALUES (
        v_student_id, p_school_id, v_adm.first_name, v_adm.last_name, NULLIF(v_adm.middle_name, ''),
        NULLIF(v_adm.gender, ''), v_adm.dob,
        NULLIF(v_adm.address, ''), NULLIF(v_adm.phone, ''), NULLIF(v_adm.nationality, ''), NULLIF(v_adm.religion, ''),
        NULLIF(v_adm.assessment_number, ''), NULLIF(v_adm.birth_cert_number, ''), NULLIF(v_adm.nemis_upi, ''),
        p_class_id, NULLIF(v_adm.previous_school, ''),
        CURRENT_DATE, NULL, 'active', v_adm.media_consent,
        -- Flat guardian columns stay populated so SMS and reminders work unchanged.
        COALESCE(NULLIF(v_primary->>'name', ''), NULLIF(v_adm.guardian_name, '')),
        COALESCE(NULLIF(v_primary->>'phone', ''), NULLIF(v_adm.guardian_phone, '')),
        COALESCE(NULLIF(v_second->>'name', ''), NULLIF(v_adm.guardian_name_2, '')),
        COALESCE(NULLIF(v_second->>'phone', ''), NULLIF(v_adm.guardian_phone_2, '')),
        COALESCE(NULLIF(v_second->>'relation', ''), NULLIF(v_adm.guardian_relation_2, ''))
    );

    -- Guardians as rows: father / mother / guardian, each with ID and occupation.
    IF v_adm.parents IS NOT NULL AND jsonb_typeof(v_adm.parents) = 'array' THEN
        FOR v_p IN SELECT * FROM jsonb_array_elements(v_adm.parents) LOOP
            IF NULLIF(TRIM(COALESCE(v_p->>'name', '')), '') IS NULL THEN CONTINUE; END IF;
            INSERT INTO guardians (student_id, name, relation, phone, email, id_number, occupation, address, is_primary, is_billing_contact)
            VALUES (v_student_id, TRIM(v_p->>'name'), NULLIF(v_p->>'relation', ''), NULLIF(v_p->>'phone', ''),
                    NULLIF(v_p->>'email', ''), NULLIF(v_p->>'id_number', ''), NULLIF(v_p->>'occupation', ''),
                    NULLIF(v_p->>'address', ''), (v_p = v_primary), (v_p = v_primary));
        END LOOP;
    ELSIF NULLIF(v_adm.guardian_name, '') IS NOT NULL THEN
        -- Older submissions: two flat guardians.
        INSERT INTO guardians (student_id, name, relation, phone, email, id_number, is_primary, is_billing_contact)
        VALUES (v_student_id, v_adm.guardian_name, NULLIF(v_adm.guardian_relationship, ''), NULLIF(v_adm.guardian_phone, ''),
                NULLIF(v_adm.guardian_email, ''), NULLIF(v_adm.guardian_id, ''), true, true);
        IF NULLIF(v_adm.guardian_name_2, '') IS NOT NULL THEN
            INSERT INTO guardians (student_id, name, relation, phone, is_primary, is_billing_contact)
            VALUES (v_student_id, v_adm.guardian_name_2, NULLIF(v_adm.guardian_relation_2, ''), NULLIF(v_adm.guardian_phone_2, ''), false, false);
        END IF;
    END IF;

    -- Emergency contacts.
    IF v_adm.emergency_contacts IS NOT NULL AND jsonb_typeof(v_adm.emergency_contacts) = 'array' THEN
        FOR v_p IN SELECT * FROM jsonb_array_elements(v_adm.emergency_contacts) LOOP
            IF NULLIF(TRIM(COALESCE(v_p->>'name', '')), '') IS NULL OR NULLIF(TRIM(COALESCE(v_p->>'phone', '')), '') IS NULL THEN CONTINUE; END IF;
            v_i := v_i + 1;
            INSERT INTO emergency_contacts (school_id, student_id, name, relationship, phone, priority)
            VALUES (p_school_id, v_student_id, TRIM(v_p->>'name'), NULLIF(v_p->>'relationship', ''), TRIM(v_p->>'phone'), v_i);
        END LOOP;
    END IF;

    -- Medical.
    v_med := v_adm.medical;
    IF v_med IS NOT NULL AND jsonb_typeof(v_med) = 'object' THEN
        INSERT INTO student_medical (student_id, school_id, conditions, other_condition, needs_treatment, treatment_details,
                                     regular_medication, medication_details, may_administer, updated_by)
        VALUES (v_student_id, p_school_id,
                COALESCE(v_med->'conditions', '{}'::jsonb),
                NULLIF(v_med->>'other', ''),
                (v_med->>'needs_treatment')::boolean,
                NULLIF(v_med->>'treatment_details', ''),
                (v_med->>'regular_medication')::boolean,
                NULLIF(v_med->>'medication_details', ''),
                (v_med->>'may_administer')::boolean,
                'admission form')
        ON CONFLICT (student_id) DO NOTHING;
    END IF;

    UPDATE admissions
       SET status = 'approved', reviewed_at = now(),
           reviewed_by = COALESCE(p_user_email, 'staff'), created_student_id = v_student_id
     WHERE id = p_admission_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'admit', 'student', v_student_id,
            jsonb_build_object('admission_id', p_admission_id,
                               'name', concat_ws(' ', v_adm.first_name, v_adm.last_name),
                               'media_consent', v_adm.media_consent,
                               'guardians', COALESCE(jsonb_array_length(v_adm.parents), 0),
                               'emergency_contacts', v_i,
                               'medical', (v_med IS NOT NULL)));

    RETURN jsonb_build_object('success', true, 'student_id', v_student_id,
                              'name', concat_ws(' ', v_adm.first_name, v_adm.last_name));
END;
$fn$;

GRANT EXECUTE ON FUNCTION admit_applicant(UUID, UUID, UUID, UUID, TEXT)
    TO service_role, authenticated, anon;
