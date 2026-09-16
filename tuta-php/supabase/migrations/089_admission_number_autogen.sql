-- Migration 089: Robust auto-generated admission numbers
-- Run in Supabase Dashboard -> SQL Editor, then Settings -> API -> "Reload Schema Cache".
--
-- WHY
-- The original admission-number trigger (migration 005) generated the next
-- number by reading MAX(admission_number) as if it were plain digits. Schools
-- using a lettered format (e.g. "CGS-090", "UTS-295") broke it: it could not
-- parse the prefix, so newly-added students were left with a BLANK admission
-- number. This replacement derives the school's dominant prefix + running
-- maximum and assigns the next number on EVERY insert path (Add Student,
-- bulk CSV import, and QR self-service approval).
--
-- BEHAVIOUR
--   * A number supplied explicitly is always respected.
--   * Otherwise: prefix = the most common "text before the trailing digits"
--     for that school (e.g. "CGS-"); next = that prefix + zero-padded (max+1),
--     keeping the school's existing digit width (min 3). e.g. CGS-117 -> CGS-118.
--   * A brand-new school with no numbered students yet seeds from the school
--     code ("<CODE>-001"), falling back to "ADM-001".
--   * Generation is serialised per school with a transaction advisory lock so
--     two concurrent admissions can never collide on the same number; the
--     UNIQUE(school_id, admission_number) constraint remains the final backstop.

CREATE OR REPLACE FUNCTION assign_admission_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix TEXT;
    v_max    INT;
    v_width  INT;
    v_code   TEXT;
BEGIN
    -- 1) Respect an explicitly supplied admission number.
    IF NEW.admission_number IS NOT NULL AND btrim(NEW.admission_number) <> '' THEN
        RETURN NEW;
    END IF;

    -- 2) Serialise number generation per school (lock frees at transaction end).
    PERFORM pg_advisory_xact_lock(hashtext('adm:' || NEW.school_id::text));

    -- 3) Dominant prefix = text before the trailing digits, most common first.
    SELECT regexp_replace(admission_number, '[0-9]+$', '')
      INTO v_prefix
      FROM students
     WHERE school_id = NEW.school_id
       AND admission_number ~ '[0-9]+$'
     GROUP BY regexp_replace(admission_number, '[0-9]+$', '')
     ORDER BY count(*) DESC, max(admission_number) DESC
     LIMIT 1;

    IF v_prefix IS NULL THEN
        -- No numbered students yet: seed from the school code, else "ADM-".
        SELECT NULLIF(btrim(code), '') INTO v_code FROM schools WHERE id = NEW.school_id;
        v_prefix := COALESCE(v_code || '-', 'ADM-');
        v_max    := 0;
        v_width  := 3;
    ELSE
        -- Highest numeric suffix (and its digit width) for that prefix.
        SELECT COALESCE(MAX((regexp_match(admission_number, '([0-9]+)$'))[1]::INT), 0),
               COALESCE(MAX(length((regexp_match(admission_number, '([0-9]+)$'))[1])), 3)
          INTO v_max, v_width
          FROM students
         WHERE school_id = NEW.school_id
           AND admission_number ~ '[0-9]+$'
           AND regexp_replace(admission_number, '[0-9]+$', '') = v_prefix;
    END IF;

    NEW.admission_number := v_prefix || LPAD((v_max + 1)::TEXT, GREATEST(v_width, 3), '0');
    RETURN NEW;
END;
$$;

-- Remove ANY pre-existing BEFORE-INSERT admission-number trigger on students
-- (its name differs across installs) so numbers are never assigned twice,
-- then attach the new one.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT t.tgname
          FROM pg_trigger t
          JOIN pg_class  c ON c.oid = t.tgrelid
          JOIN pg_proc   p ON p.oid = t.tgfoid
         WHERE c.relname = 'students'
           AND NOT t.tgisinternal
           AND t.tgname <> 'trg_assign_admission_number'
           AND pg_get_functiondef(p.oid) ILIKE '%admission_number%'
    LOOP
        EXECUTE format('DROP TRIGGER %I ON students', r.tgname);
    END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_assign_admission_number ON students;
CREATE TRIGGER trg_assign_admission_number
    BEFORE INSERT ON students
    FOR EACH ROW
    EXECUTE FUNCTION assign_admission_number();
