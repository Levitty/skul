-- 096_connect_whitestar_branches.sql
-- Connect ALL Whitestar branches to the Whitestar group.
--
-- Background: migration 085 created the "Whitestar" group and its super-admin
-- but seeded ZERO member rows (the INSERT was left as a template). Only Springs
-- and Senior were later added by hand, so the newer branches (Academy Langata,
-- Springs Sabaki, Highrise) never appeared in the group dashboard or the
-- cross-branch staff channels. Membership is decided solely by rows in
-- school_group_members, so adding the missing rows fixes both immediately.
--
-- Idempotent: ON CONFLICT DO NOTHING means the two already-connected branches
-- are no-ops, and re-running is safe.

WITH grp AS (
    SELECT id AS group_id
    FROM school_groups
    WHERE name ILIKE 'Whitestar%'
    ORDER BY created_at
    LIMIT 1
)
INSERT INTO school_group_members (group_id, school_id)
SELECT g.group_id, s.id
FROM schools s
CROSS JOIN grp g
WHERE s.name ILIKE 'Whitestar%'
ON CONFLICT DO NOTHING;
