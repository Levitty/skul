-- ─────────────────────────────────────────────────────────────────
-- Migration 085: School groups (multi-branch consolidation)
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor. After: Reload Schema Cache. Idempotent.
--
-- A "group" (e.g. Whitestar) owns several independent branch schools. Each
-- branch stays its own tenant (own admin/fees/books); a group super-admin
-- gets a consolidated dashboard across the group's branches, with drill-down
-- into each. Branches are added to the group as they're created.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_groups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_group_members (
    group_id  UUID NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id)       ON DELETE CASCADE,
    PRIMARY KEY (group_id, school_id)
);

CREATE TABLE IF NOT EXISTS school_group_admins (
    group_id   UUID NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,           -- auth.users id of the super admin
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_school_group_admins_user ON school_group_admins(user_id);

ALTER TABLE school_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_group_admins  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srv_school_groups"        ON school_groups;
DROP POLICY IF EXISTS "srv_school_group_members" ON school_group_members;
DROP POLICY IF EXISTS "srv_school_group_admins"  ON school_group_admins;
CREATE POLICY "srv_school_groups"        ON school_groups        FOR ALL USING (true);
CREATE POLICY "srv_school_group_members" ON school_group_members FOR ALL USING (true);
CREATE POLICY "srv_school_group_admins"  ON school_group_admins  FOR ALL USING (true);

-- ── Seed Whitestar + its super admin ─────────────────────────────
INSERT INTO school_groups (name) VALUES ('Whitestar') ON CONFLICT (name) DO NOTHING;

INSERT INTO school_group_admins (group_id, user_id)
SELECT g.id, u.id
FROM school_groups g
JOIN auth.users u ON u.email = 'levitymutua@icloud.com'
WHERE g.name = 'Whitestar'
ON CONFLICT (group_id, user_id) DO NOTHING;

-- To add a branch later:
--   INSERT INTO school_group_members (group_id, school_id)
--   SELECT (SELECT id FROM school_groups WHERE name='Whitestar'),
--          (SELECT id FROM schools WHERE code='<BRANCH_CODE>')
--   ON CONFLICT DO NOTHING;

-- Confirm the super admin is attached:
SELECT g.name AS group_name, u.email AS super_admin
FROM school_group_admins a
JOIN school_groups g ON g.id = a.group_id
JOIN auth.users u    ON u.id = a.user_id;
