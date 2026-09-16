-- ─────────────────────────────────────────────────────────────────
-- Migration 108: Student attendance capture (the missing daily pump)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- Design (see Tuta_Attendance_Capture_Spec.md): a per-class NO-LOGIN register
-- link (house pattern = admit QR / offer tokens), absent-only marking, storage
-- as EXCEPTIONS plus a per-class-per-day session receipt — so "register not
-- taken" is itself a queryable fact. One governed action writes everything.
--
-- Also fixes a base-schema landmine: attendance_records has
-- UNIQUE(student_id, date, period_id), but daily rows carry period_id = NULL
-- and Postgres treats NULLs as distinct — so daily rows were NEVER deduped.
-- A partial unique index closes that.
--
-- Security: RLS enabled, no policies (service-role key only, house style).
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

-- ── Session receipt: one row per class per day the register was taken ─────
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    present_count INT  NOT NULL DEFAULT 0,
    absent_count  INT  NOT NULL DEFAULT 0,
    late_count    INT  NOT NULL DEFAULT 0,
    source        TEXT NOT NULL DEFAULT 'class_link'
                  CHECK (source IN ('class_link', 'office', 'import')),
    taken_by_name TEXT,
    taken_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_id, class_id, date)
);
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_att_sessions_school_date
    ON attendance_sessions(school_id, date);

-- ── Per-class register tokens (rotatable; power the no-login link) ─────────
-- Stored plaintext so the office can reprint the QR at any time. The table is
-- RLS-locked with no policy (service-role only), and rotation invalidates a
-- leaked link — a strictly stronger posture than the admit QR (?school=id).
CREATE TABLE IF NOT EXISTS class_register_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    UNIQUE (school_id, class_id)
);
ALTER TABLE class_register_tokens ENABLE ROW LEVEL SECURITY;

-- ── Fix the daily-dedup landmine + link records to their session ───────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_daily_unique
    ON attendance_records (student_id, date) WHERE period_id IS NULL;
ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS session_id    UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS marked_by_name TEXT;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_attendance_student_date
    ON attendance_records(student_id, date);

-- ── The action: record_attendance ──────────────────────────────────────────
-- One governed write for the whole register: upserts the session receipt and
-- replaces that class-day's exception rows atomically. Re-submission is a
-- correction (idempotent by the session unique). Emits one audit row.
--
-- p_exceptions: jsonb array of {"student_id": uuid, "status": "absent"|"late"|"excused", "note": text?}
-- Invariants: class belongs to school; date within today ± 1 (no history
-- back-fill through the public link); exceptions must be active learners of
-- THIS class (others are skipped, reported back).
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

    IF p_date IS NULL OR p_date > CURRENT_DATE + 1 OR p_date < CURRENT_DATE - 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'The register can only be taken for today.');
    END IF;

    SELECT count(*) INTO v_roster
      FROM students
     WHERE school_id = p_school_id AND current_class_id = p_class_id AND status = 'active';

    IF v_roster = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active learners in this class.');
    END IF;

    -- Upsert the session receipt (locks the class-day; counts filled below).
    INSERT INTO attendance_sessions (school_id, class_id, date, source, taken_by_name)
    VALUES (p_school_id, p_class_id, p_date, p_source, NULLIF(p_taken_by, ''))
    ON CONFLICT (school_id, class_id, date) DO UPDATE
        SET source = EXCLUDED.source,
            taken_by_name = COALESCE(EXCLUDED.taken_by_name, attendance_sessions.taken_by_name),
            updated_at = now()
    RETURNING id INTO v_session_id;

    -- Replace this class-day's exception rows (re-submission = correction).
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
                               'skipped', v_skipped));

    RETURN jsonb_build_object('success', true, 'session_id', v_session_id,
                              'present', v_roster - v_absent - v_late - v_excused,
                              'absent', v_absent, 'late', v_late, 'excused', v_excused,
                              'skipped', v_skipped);
END;
$fn$;
