-- ============================================================================
-- 070: Receipt number on payments  (invoice ≠ receipt)
--
-- An invoice is a bill the school issues. A receipt is the school's
-- acknowledgement that money was received — with the school's OWN sequential
-- number (RCP-YYYY-NNNN, per school, per year). That number is distinct from
-- payments.transaction_ref, which is the PAYER's proof (M-Pesa code, bank slip,
-- cheque number) and is supplied by the payer.
--
-- This migration adds the column, a UNIQUE constraint, a BEFORE INSERT trigger
-- that auto-assigns the next number, and a backfill for existing payments.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_school_receipt_unique
    ON payments(school_id, receipt_number)
    WHERE receipt_number IS NOT NULL;


-- Compute the next RCP-YYYY-NNNN for a (school, year). Advisory lock keeps
-- concurrent inserts atomic without locking the whole payments table.
CREATE OR REPLACE FUNCTION compute_next_receipt_number(p_school_id UUID, p_at TIMESTAMPTZ)
RETURNS TEXT AS $$
DECLARE
    v_year TEXT := TO_CHAR(p_at, 'YYYY');
    v_seq  INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_school_id::text || ':' || v_year));

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(receipt_number FROM ('^RCP-' || v_year || '-([0-9]+)$')) AS INTEGER)
    ), 0) + 1
    INTO v_seq
    FROM payments
    WHERE school_id = p_school_id
      AND receipt_number ~ ('^RCP-' || v_year || '-[0-9]+$');

    RETURN 'RCP-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;


-- Trigger: assign receipt_number on insert if the caller did not set one.
CREATE OR REPLACE FUNCTION assign_receipt_number_trigger() RETURNS TRIGGER AS $$
DECLARE
    v_at TIMESTAMPTZ := COALESCE(NEW.paid_at, NEW.created_at, NOW());
BEGIN
    IF (NEW.receipt_number IS NULL OR NEW.receipt_number = '') AND NEW.school_id IS NOT NULL THEN
        NEW.receipt_number := compute_next_receipt_number(NEW.school_id, v_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_assign_receipt_number ON payments;
CREATE TRIGGER payments_assign_receipt_number
    BEFORE INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION assign_receipt_number_trigger();


-- Backfill existing payments with sequential numbers per (school, year),
-- ordered by when the money was actually received.
WITH numbered AS (
    SELECT id, school_id,
           COALESCE(paid_at, created_at, NOW()) AS at_ts,
           ROW_NUMBER() OVER (
             PARTITION BY school_id, TO_CHAR(COALESCE(paid_at, created_at, NOW()), 'YYYY')
             ORDER BY COALESCE(paid_at, created_at, NOW()), id
           ) AS seq
      FROM payments
     WHERE (receipt_number IS NULL OR receipt_number = '')
       AND school_id IS NOT NULL
)
UPDATE payments p
   SET receipt_number = 'RCP-' || TO_CHAR(n.at_ts, 'YYYY') || '-' || LPAD(n.seq::TEXT, 4, '0')
  FROM numbered n
 WHERE p.id = n.id;
