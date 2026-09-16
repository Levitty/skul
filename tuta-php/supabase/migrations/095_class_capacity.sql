-- 095_class_capacity.sql
-- Per-class target capacity, so admins can see free seats / where to market.
-- Nullable: a class with no capacity set simply shows "—" (no target).

ALTER TABLE classes ADD COLUMN IF NOT EXISTS capacity integer;

COMMENT ON COLUMN classes.capacity IS
    'Target/maximum enrolment for this class. Used to compute free seats and highlight under-filled classes for marketing. NULL = no target set.';
