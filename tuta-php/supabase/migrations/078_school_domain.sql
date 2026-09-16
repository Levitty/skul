-- 078_school_domain.sql
-- Per-tenant login domains. Each school can have its own login hostname
-- (e.g. mgt.crownofgoldschool.com); the platform admin host stays APP_URL
-- (school.tutagora.com). Run once in Supabase → SQL Editor.

ALTER TABLE schools ADD COLUMN IF NOT EXISTS domain text;

-- One school per hostname (case-insensitive), nulls allowed (platform login).
CREATE UNIQUE INDEX IF NOT EXISTS schools_domain_unique
  ON schools (lower(domain)) WHERE domain IS NOT NULL;
