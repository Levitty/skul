-- =============================================
-- 035: Credit Notes Enhancements
--      Add status workflow and approval tracking
-- =============================================

-- Add status and approval fields to credit_notes table
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'applied', 'voided'));
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS description TEXT;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_issued_at ON credit_notes(issued_at);
