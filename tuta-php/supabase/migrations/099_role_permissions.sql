-- Migration 099: Editable roles & permissions (capability system) — FOUNDATION
--
-- Introduces named capabilities a role holds, so an admin can define roles and
-- toggle what each can do (Settings → Roles & Permissions) instead of us
-- hard-coding roles in PHP. This migration lays the data foundation; the PHP
-- guard/nav/UI refactor comes in later phases (see ROLE_PERMISSIONS_SPEC.md).
--
-- Security: RLS ENABLED on both tables, NO permissive policy. The app uses the
-- service-role key (bypasses RLS), so it has full access; anon gets nothing.

-- ── Global system defaults (source of truth when a school hasn't customised) ──
create table if not exists role_defaults (
    role_key     text primary key,
    label        text not null,
    capabilities jsonb not null default '[]'::jsonb,
    is_system    boolean not null default true
);
alter table role_defaults enable row level security;

-- ── Per-school overrides + custom roles (row exists only when customised) ─────
create table if not exists school_roles (
    id           uuid primary key default gen_random_uuid(),
    school_id    uuid not null references schools(id) on delete cascade,
    role_key     text not null,
    label        text not null,
    capabilities jsonb not null default '[]'::jsonb,
    is_custom    boolean not null default false,
    created_at   timestamptz default now(),
    updated_at   timestamptz default now(),
    unique (school_id, role_key)
);
alter table school_roles enable row level security;
create index if not exists idx_school_roles_school on school_roles(school_id);

-- ── Seed defaults — replicate today's behaviour, then editable ────────────────
insert into role_defaults (role_key, label, capabilities) values
  ('head_teacher','Head Teacher',
     '["students.manage","admissions.manage","results.enter","results.manage","teaching.own","academics.oversight","services.manage","dashboard.finance"]'::jsonb),
  ('teacher','Teacher',
     '["teaching.own","results.enter"]'::jsonb),
  ('bursar','Bursar',
     '["fees.manage","finance.books","comms.send","dashboard.finance"]'::jsonb),
  ('front_office','Front Office',
     '["fees.manage","admissions.manage","students.manage","services.manage","dashboard.finance"]'::jsonb),
  ('exams_officer','Exams Officer',
     '["results.enter","results.manage"]'::jsonb),
  ('parent','Parent','[]'::jsonb)
on conflict (role_key) do update
   set capabilities = excluded.capabilities, label = excluded.label;

-- Allow CUSTOM role keys on memberships. Safe now that access is capability-
-- driven: an unknown/custom role resolves to no capabilities (deny-all) via
-- userCan(), so it can never escalate — it just grants whatever school_roles
-- says. normalizeRole() passes custom keys through instead of failing closed.
alter table user_schools drop constraint if exists user_schools_role_check;
