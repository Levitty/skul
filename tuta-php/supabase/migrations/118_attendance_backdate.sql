-- ─────────────────────────────────────────────────────────────────
-- Migration 112: let the office take or correct a register for a past day
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- record_attendance (mig. 108) accepted only today ±1. Real schools need to
-- back-fill: a teacher forgets Monday, the paper register is typed up on
-- Wednesday, or a correction surfaces at the end of the week.
--
-- The rule now depends on WHO is submitting:
--   • 'class_link' (the public per-class QR/token page, no login) stays
--     TODAY-ONLY — a public link must never be able to rewrite history.
--   • 'office' / 'import' (authenticated staff) may back-date up to 90 days.
--   • Nobody may mark the FUTURE (the +1 day allows for timezone drift only).
--
-- Everything else about the action is unchanged.
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_attendance(
    p_school_id  UUID,
    p_class_id   UUID,
    p_date       DATE,
    p_exceptions JSONB   DEFAULT '[]'::jsonb,
    p_source     TEXT    DEFAULT 'class_link',
    p_taken_by   TEXT    DEFAULT NULL,
    p_user_id    UUID    DEFAULT NULL,
    p_user_email TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_session_id UUID;
    v_roster     INT;
    v_absent     INT := 0;
    v_late       INT := 0;
    v_excused    INT := 0;
    v_skipped    INT := 0;
    v_row        JSONB;
    v_sid        UUID;
    v_status     TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM classes WHERE id = p_class_id AND school_id = p_school_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Class not found.');
    END IF;

    IF p_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A date is required.');
    END IF;

    -- Never the future (the +1 tolerates server/local timezone drift).
    IF p_date > CURRENT_DATE + 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'The register cannot be taken for a future date.');
    END IF;

    IF p_source = 'class_link' THEN
        IF p_date < CURRENT_DATE - 1 THEN
            RETURN jsonb_build_object('success', false,
                'error', 'The class register link can only be used for today. Ask the office to correct an earlier day.');
        END IF;
    ELSE
        IF p_date < CURRENT_DATE - 90 THEN
            RETURN jsonb_build_object('success', false,
                'error', 'Registers can be backdated up to 90 days.');
        END IF;
    END IF;

    SELECT count(*) INTO v_roster
      FROM students
     WHERE school_id = p_school_id AND current_class_id = p_class_id AND status = 'active';

    IF v_roster = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active learners in this class.');
    END IF;

    INSERT INTO attendance_sessions (school_id, class_id, date, source, taken_by_name)
    VALUES (p_school_id, p_class_id, p_date, p_source, NULLIF(p_taken_by, ''))
    ON CONFLICT (school_id, class_id, date) DO UPDATE
        SET source = EXCLUDED.source,
            taken_by_name = COALESCE(EXCLUDED.taken_by_name, attendance_sessions.taken_by_name),
            updated_at = now()
    RETURNING id INTO v_session_id;

    DELETE FROM attendance_records WHERE session_id = v_session_id;

    FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) LOOP
        v_sid    := (v_row->>'student_id')::uuid;
        v_status := lower(coalesce(v_row->>'status', 'absent'));
        IF v_status NOT IN ('absent', 'late', 'excused') THEN v_status := 'absent'; END IF;

        IF EXISTS (SELECT 1 FROM students
                    WHERE id = v_sid AND school_id = p_school_id
                      AND current_class_id = p_class_id AND status = 'active') THEN
            INSERT INTO attendance_records
                (school_id, student_id, date, period_id, status, note, session_id, marked_by_name)
            VALUES
                (p_school_id, v_sid, p_date, NULL, v_status,
                 NULLIF(v_row->>'note', ''), v_session_id, NULLIF(p_taken_by, ''))
            ON CONFLICT (student_id, date) WHERE period_id IS NULL
            DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note,
                          session_id = EXCLUDED.session_id, marked_by_name = EXCLUDED.marked_by_name;
            IF v_status = 'absent'  THEN v_absent  := v_absent  + 1; END IF;
            IF v_status = 'late'    THEN v_late    := v_late    + 1; END IF;
            IF v_status = 'excused' THEN v_excused := v_excused + 1; END IF;
        ELSE
            v_skipped := v_skipped + 1;
        END IF;
    END LOOP;

    UPDATE attendance_sessions
       SET absent_count  = v_absent,
           late_count    = v_late,
           present_count = v_roster - v_absent - v_late - v_excused,
           updated_at    = now()
     WHERE id = v_session_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'record_attendance', 'attendance_session', v_session_id,
            jsonb_build_object('class_id', p_class_id, 'date', p_date, 'source', p_source,
                               'taken_by', p_taken_by, 'roster', v_roster,
                               'absent', v_absent, 'late', v_late, 'excused', v_excused,
                               'skipped', v_skipped,
                               'backdated', (p_date < CURRENT_DATE)));

    RETURN jsonb_build_object('success', true, 'session_id', v_session_id,
                              'present', v_roster - v_absent - v_late - v_excused,
                              'absent', v_absent, 'late', v_late, 'excused', v_excused,
                              'skipped', v_skipped);
END;
$fn$;
