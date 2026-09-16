-- ─────────────────────────────────────────────────────────────────
-- Migration 081: Homework / assignments tracker (teacher dashboard)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Reload Schema Cache.
--
-- Backs the teacher homework board (?route=teacher/homework): a teacher
-- records an assignment for a class (+optional subject) with a due date and
-- marks it done. Deterministic, no AI — just removes the "where did I write
-- down that homework" problem.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS homework (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
    class_id        UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
    subject_id      UUID REFERENCES subjects(id)          ON DELETE SET NULL,
    term_id         UUID REFERENCES terms(id)             ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    assigned_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date        DATE,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','archived')),
    created_by      UUID,
    created_by_name TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homework_class ON homework(school_id, class_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_homework_owner ON homework(school_id, created_by);

ALTER TABLE homework ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_homework" ON homework;
CREATE POLICY "srv_homework" ON homework FOR ALL USING (true);
