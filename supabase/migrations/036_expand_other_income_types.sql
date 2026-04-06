-- Migration: Expand Other Income Types
-- Purpose: Add new income category types for donations, book sales, event revenue, etc.

-- Update the CHECK constraint on other_income.income_type
-- Drop the existing constraint
ALTER TABLE IF EXISTS other_income
DROP CONSTRAINT IF EXISTS other_income_income_type_check;

-- Add the new constraint with expanded types
ALTER TABLE other_income
ADD CONSTRAINT other_income_income_type_check CHECK (income_type IN (
    'uniform_sale',
    'trip_payment',
    'club_fee',
    'donation',
    'sponsorship',
    'book_sales',
    'event_revenue',
    'rental_income',
    'interest_income',
    'government_grant',
    'miscellaneous'
));

-- Create an index for faster queries by income type
CREATE INDEX IF NOT EXISTS idx_other_income_type_amount ON other_income(income_type, amount DESC);
