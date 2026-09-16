-- Migration 063: Bulk student import RPC
-- Run in Supabase Dashboard -> SQL Editor.
-- After running: Settings -> API -> click "Reload Schema Cache".
--
-- WHAT THIS DOES
-- import_students_batch() inserts many students AND their enrollment rows in
-- ONE atomic transaction. The PHP importer pre-validates every row, then sends
-- the clean rows here as a single JSON array.
--
-- WHY A SERVER-SIDE LOOP (and not one big multi-row INSERT)
-- The admission-number trigger (migration 005) fills a blank admission_number
-- by reading MAX(admission_number) for the school. In a single multi-row
-- INSERT, the rows are invisible to each other's BEFORE trigger, so every row
-- would be handed the SAME number and the whole insert would fail the
-- UNIQUE(school_id, admission_number) constraint.
-- A loop of single-row INSERTs avoids that: each statement sees the previous
-- row, so numbering stays sequential. It is still one round trip from PHP and
-- one transaction, so it is both correct and fast (sub-second for a few
-- hundred rows).
--
-- ATOMICITY
-- If ANY row fails, the EXCEPTION block rolls the whole batch back -- the
-- import is all-or-nothing, never half-finished.

CREATE OR REPLACE FUNCTION import_students_batch(
    p_school_id        UUID,
    p_academic_year_id UUID,
    p_students         JSONB
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_student    JSONB;
    v_student_id UUID;
    v_class_id   UUID;
    v_imported   INT := 0;
    v_row        INT := 0;
BEGIN
    IF p_school_id IS NULL THEN
        RAISE EXCEPTION 'No school context supplied';
    END IF;

    IF p_students IS NULL OR jsonb_typeof(p_students) <> 'array' THEN
        RAISE EXCEPTION 'No student rows supplied';
    END IF;

    FOR v_student IN SELECT * FROM jsonb_array_elements(p_students)
    LOOP
        v_row := v_row + 1;
        v_class_id := NULLIF(v_student->>'current_class_id', '')::UUID;

        -- One INSERT per row: keeps the admission-number trigger correct.
        INSERT INTO students (
            school_id, first_name, last_name, middle_name,
            admission_number, gender, dob, current_class_id,
            student_type, roll_number, admission_date, family_id,
            guardian_name, guardian_phone, phone, email, address,
            religion, status
        ) VALUES (
            p_school_id,
            v_student->>'first_name',
            v_student->>'last_name',
            NULLIF(v_student->>'middle_name', ''),
            NULLIF(v_student->>'admission_number', ''),   -- blank -> trigger fills it
            NULLIF(v_student->>'gender', ''),
            NULLIF(v_student->>'dob', '')::DATE,
            v_class_id,
            COALESCE(NULLIF(v_student->>'student_type', ''), 'day_scholar'),
            NULLIF(v_student->>'roll_number', ''),
            COALESCE(NULLIF(v_student->>'admission_date', '')::DATE, CURRENT_DATE),
            NULLIF(v_student->>'family_id', ''),
            NULLIF(v_student->>'guardian_name', ''),
            NULLIF(v_student->>'guardian_phone', ''),
            NULLIF(v_student->>'phone', ''),
            NULLIF(v_student->>'email', ''),
            NULLIF(v_student->>'address', ''),
            NULLIF(v_student->>'religion', ''),
            'active'
        )
        RETURNING id INTO v_student_id;

        -- Enrollment for the current academic year (only if we know both).
        IF p_academic_year_id IS NOT NULL AND v_class_id IS NOT NULL THEN
            INSERT INTO enrollments (
                student_id, academic_year_id, class_id, school_id, enrollment_date
            ) VALUES (
                v_student_id, p_academic_year_id, v_class_id, p_school_id, CURRENT_DATE
            );
        END IF;

        v_imported := v_imported + 1;
    END LOOP;

    RETURN json_build_object('imported', v_imported);

EXCEPTION
    WHEN OTHERS THEN
        -- Any failure rolls the WHOLE batch back -- no partial import.
        RAISE EXCEPTION 'Import failed on row %: %', v_row, SQLERRM;
END;
$$;
