-- ─────────────────────────────────────────────────────────────────
-- Migration 064: Add fee_head_id to invoice_items
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
--
-- Bug: generate_invoices_for_class (migration 059) inserts each fee-head
-- line item with a fee_head_id, but the invoice_items table never had
-- that column — no migration created it. Every invoice generation failed:
--   column "fee_head_id" of relation "invoice_items" does not exist
--
-- fee_head_id is nullable on purpose — transport, activity, and
-- carry-forward line items have no fee head. ON DELETE SET NULL keeps
-- invoice history intact if a fee head is later removed.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS fee_head_id UUID
        REFERENCES fee_heads(id) ON DELETE SET NULL;

-- Supports "collected by fee head" reporting.
CREATE INDEX IF NOT EXISTS idx_invoice_items_fee_head_id
    ON invoice_items(fee_head_id);
