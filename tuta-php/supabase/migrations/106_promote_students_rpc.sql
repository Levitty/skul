-- ─────────────────────────────────────────────────────────────────
-- Migration 106: promote_students() — bulk promote / graduate / repeat
--                as one atomic governed Action (ontology Step 2).
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- The promotion screen (modules/students/promote.php) looped in PHP and, per
-- student, did TWO writes over the network — update the student's class/status,
-- then insert a promotion_history row — with no transaction around them. A
-- failure between the two left a student moved to the new class with no history
-- record (or graduated with none). Across a batch it could leave some students
-- promoted and some not.
--
-- This RPC does the whole batch in ONE transaction: dup-check, student update,
-- and history insert per learner, then a single audit line. All-or-nothing —
-- there is no half-promoted state. Mirrors the p_students-jsonb style of
-- generate_invoices_for_class.
--
-- p_type: 'promoted' (move class), 'graduated' (status=graduated), 'repeated'
--         (stays, history only). Dup-check matches the prior per-mode behaviour.
--
-- CONTRACT: returns JSONB { success: bool, error?: text, promoted: int, skipped: int }
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION promote_students(
    p_school_id   UUID,
    p_student_ids JSONB,          -- array of student uuid strings
    p_from_class  UUID,
    p_to_class    UUID,
    p_to_section  UUID,
    p_from_year   UUID,
    p_to_year     UUID,
    p_type        TEXT,
    p_user_id     UUID    DEFAULT NULL,
    p_user_email  TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_txt      TEXT;
    v_sid      UUID;
    v_exists   BOOLEAN;
    v_promoted INT := 0;
    v_skipped  INT := 0;
BEGIN
    IF p_type NOT IN ('promoted', 'graduated', 'repeated') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid promotion type.');
    END IF;

    FOR v_txt IN SELECT jsonb_array_elements_text(COALESCE(p_student_ids, '[]'::jsonb)) LOOP
        v_sid := v_txt::uuid;

        -- Already recorded for this transition? (promote ignores type, as before)
        IF p_type = 'promoted' THEN
            SELECT EXISTS (SELECT 1 FROM promotion_history
                WHERE school_id = p_school_id AND student_id = v_sid
                  AND from_year_id = p_from_year AND to_year_id = p_to_year) INTO v_exists;
        ELSE
            SELECT EXISTS (SELECT 1 FROM promotion_history
                WHERE school_id = p_school_id AND student_id = v_sid
                  AND from_year_id = p_from_year AND to_year_id = p_to_year
                  AND promotion_type = p_type) INTO v_exists;
        END IF;

        IF v_exists THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        IF p_type = 'promoted' THEN
            UPDATE students
               SET current_class_id = p_to_class,
                   section_id = COALESCE(p_to_section, section_id),
                   updated_at = now()
             WHERE id = v_sid AND school_id = p_school_id;

            INSERT INTO promotion_history
                (school_id, student_id, from_class_id, to_class_id, from_year_id, to_year_id, promotion_type, promoted_at)
            VALUES (p_school_id, v_sid, p_from_class, p_to_class, p_from_year, p_to_year, 'promoted', now());

        ELSIF p_type = 'graduated' THEN
            UPDATE students
               SET status = 'graduated', updated_at = now()
             WHERE id = v_sid AND school_id = p_school_id;

            INSERT INTO promotion_history
                (school_id, student_id, from_class_id, to_class_id, from_year_id, to_year_id, promotion_type, promoted_at)
            VALUES (p_school_id, v_sid, p_from_class, NULL, p_from_year, p_to_year, 'graduated', now());

        ELSE  -- repeated: no student change, history only
            INSERT INTO promotion_history
                (school_id, student_id, from_class_id, to_class_id, from_year_id, to_year_id, promotion_type, promoted_at)
            VALUES (p_school_id, v_sid, p_from_class, p_from_class, p_from_year, p_to_year, 'repeated', now());
        END IF;

        v_promoted := v_promoted + 1;
    END LOOP;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, p_type, 'student', NULL,
            jsonb_build_object('type', p_type, 'from_class', p_from_class, 'to_class', p_to_class,
                               'from_year', p_from_year, 'to_year', p_to_year,
                               'count', v_promoted, 'skipped', v_skipped));

    RETURN jsonb_build_object('success', true, 'promoted', v_promoted, 'skipped', v_skipped);
END;
$fn$;
