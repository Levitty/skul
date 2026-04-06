-- Add 'journal' to allowed general_ledger transaction_type for manual journal entries
ALTER TABLE general_ledger DROP CONSTRAINT IF EXISTS general_ledger_transaction_type_check;
ALTER TABLE general_ledger ADD CONSTRAINT general_ledger_transaction_type_check CHECK (
  transaction_type IN (
    'fee_invoice', 'fee_payment', 'expense', 'adjustment', 'transfer',
    'other_income', 'refund', 'journal'
  )
);
