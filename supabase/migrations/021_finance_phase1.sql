-- Phase 1 Finance Enhancements
-- Adds billing_cycle to fee_structures and receipt_number to payments

-- 1) Fee structures billing cycle
ALTER TABLE fee_structures
ADD COLUMN IF NOT EXISTS billing_cycle TEXT
CHECK (billing_cycle IN ('monthly', 'termly', 'annually'))
DEFAULT 'termly';

-- 2) Payment receipt number
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS receipt_number TEXT;

-- Ensure receipt numbers are unique when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt_number
ON payments(receipt_number)
WHERE receipt_number IS NOT NULL;

