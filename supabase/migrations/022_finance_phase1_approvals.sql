-- Phase 1 Finance Enhancements - Expense Approvals

-- 1) Add approval status to expenses
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS approval_status TEXT
CHECK (approval_status IN ('pending', 'approved', 'rejected'))
DEFAULT 'pending';

-- 2) Approval history table
CREATE TABLE IF NOT EXISTS expense_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    approver_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
    comments TEXT,
    approved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_approvals_expense ON expense_approvals(expense_id);
