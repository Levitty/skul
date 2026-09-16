-- 097_payments_method_dynamic.sql
-- Payment methods are configurable per school (Settings → Payment Methods →
-- table payment_methods). A legacy hardcoded CHECK constraint on
-- payments.method still only allowed the original codes (cash, mpesa,
-- bank_transfer, cheque, ...), so a payment recorded with a school-added
-- method — e.g. 'paybill' — was REJECTED by the database and silently failed
-- ("new row for relation payments violates check constraint
-- payments_method_check"). Validation now lives in the app: the method always
-- comes from the school's configured list, so the DB CHECK is redundant and
-- harmful. Drop it.

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;

-- Bonus: map M-Pesa Paybill to the M-Pesa cash account in the ledger (it was
-- falling through to the bank default). Harmless if the ledger isn't in use.
CREATE OR REPLACE FUNCTION cash_account_code(p_method TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
    SELECT CASE lower(COALESCE(p_method, ''))
        WHEN 'cash'           THEN '1000'
        WHEN 'mpesa'          THEN '1020'
        WHEN 'paybill'        THEN '1020'
        WHEN 'mobile_money'   THEN '1020'
        WHEN 'bank_transfer'  THEN '1010'
        WHEN 'cheque'         THEN '1010'
        WHEN 'card'           THEN '1010'
        WHEN 'bank'           THEN '1010'
        ELSE '1010'
    END;
$fn$;
