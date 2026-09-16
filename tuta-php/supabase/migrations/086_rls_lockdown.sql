-- ─────────────────────────────────────────────────────────────────
-- Migration 086: RLS lockdown — close the database perimeter
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor, then Reload Schema Cache. Idempotent.
--
-- WHY: This PHP app talks to PostgREST ONLY with the service-role key, which
-- BYPASSES row-level security. So RLS policies here exist purely to control
-- what the PUBLIC `anon` role (and any `authenticated` GoTrue client) can do
-- against the public REST API at https://<project>.supabase.co/rest/v1/<table>.
--
-- Two problems this fixes:
--   1. Tables created in migration 056 (school_settings, mpesa_*) had RLS
--      NEVER ENABLED — so `anon` could read M-Pesa consumer keys/secrets and
--      payer PII, and forge payment rows, straight off the REST API.
--   2. Many tables had `FOR ALL USING (true)` policies with no role clause,
--      which default to TO PUBLIC (includes `anon`) — same exposure.
--
-- FIX: enable RLS everywhere and scope every server-side policy to
-- `service_role`. The app is unaffected (service_role bypasses RLS); the
-- `anon` role loses all access. If you later add a browser-side Supabase
-- client for authenticated users, add narrow `TO authenticated` policies then.
-- ─────────────────────────────────────────────────────────────────

-- For each target table: ENABLE RLS, DROP EVERY existing policy (so no stray
-- TO-PUBLIC `USING(true)` policy survives, regardless of its name), then CREATE
-- one service_role-only policy. Dropping by catalog avoids name-guessing.
-- The app is unaffected: service_role bypasses RLS entirely.
DO $$
DECLARE t text;
DECLARE r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- (1) migration-056 tables that had RLS OFF — leaked M-Pesa creds + PII
    'school_settings', 'payment_methods', 'mpesa_stk_requests', 'mpesa_c2b_payments',
    -- (2) tables whose policy was FOR ALL USING (true) (open to anon)
    'audit_logs', 'fee_discounts', 'student_discounts', 'invitations',
    'category_budgets', 'enquiries', 'admissions', 'approval_requests',
    'homework', 'lesson_plans', 'questions', 'timetable_slots',
    'school_groups', 'school_group_members', 'school_group_admins',
    'campus_mpesa_settings'
  ] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Drop every policy currently on the table (by real name from the catalog).
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'srv_' || t, t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. MANUAL CHECK REQUIRED — core tables predate the numbered migrations
-- ─────────────────────────────────────────────────────────────────
-- students, invoices, payments, invoice_items, user_profiles, user_schools,
-- schools, expenses, income, report_cards were created BEFORE migration 052
-- and aren't in this repo, so their RLS posture can't be set here blind.
--
-- Run this first to see the truth:
--
--   SELECT c.relname AS table, c.relrowsecurity AS rls_on
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN ('students','invoices','payments','invoice_items',
--         'user_profiles','user_schools','schools','expenses','income','report_cards')
--   ORDER BY 1;
--
--   SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies WHERE schemaname='public'
--   ORDER BY tablename, policyname;
--
-- For ANY table where rls_on = false, OR a policy shows roles {public}/{anon}
-- with qual = true, lock it down (safe — the app uses service_role which
-- bypasses RLS):
--
--   ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS "<existing_public_policy>" ON <t>;
--   CREATE POLICY "srv_<t>" ON <t> FOR ALL TO service_role USING (true) WITH CHECK (true);
--
-- These core tables are the highest-impact: students roster + all finance.
-- ─────────────────────────────────────────────────────────────────

-- Verify the lockdown took (no policy should list {public} or {anon}):
SELECT tablename, policyname, roles
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
