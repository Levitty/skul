-- ─────────────────────────────────────────────────────────────────
-- Migration 103: record_expense() — recording money out as a governed Action
--                (ontology Step 2).
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor.
-- After running: Settings → API → Reload Schema Cache.
--
-- WHY
-- Adding an expense (modules/finance/expenses.php) inserts one row; the ledger
-- double-entry is posted automatically by trg_post_expense. But the expense was
-- written with NO audit line — money leaving the school was untraceable to a
-- user. For an anti-fraud finance module (paper §7/§11) that is the wrong gap to
-- leave open. This RPC makes recording an expense one governed, self-auditing
-- action: validate → insert (→ trigger posts the ledger) → emit the audit line,
-- all atomically.
--
-- Category budgets (mig. 076) stay ADVISORY here — schools legitimately need to
-- record over-budget spend; the action records and audits, it does not block.
--
-- CONTRACT: returns JSONB { success: bool, error?: text, expense_id?: uuid }
--           SECURITY DEFINER · takes p_user_id / p_user_email for the audit row.
-- Invariants: description non-empty; amount > 0; category belongs to the school.
--
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_expense(
    p_school_id      UUID,
    p_description    TEXT,
    p_amount         NUMERIC,
    p_expense_date   DATE,
    p_category_id    UUID,
    p_vendor_name    TEXT    DEFAULT NULL,
    p_invoice_number TEXT    DEFAULT NULL,
    p_payment_method TEXT    DEFAULT 'cash',
    p_user_id        UUID    DEFAULT NULL,
    p_user_email     TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_expense_id UUID := gen_random_uuid();
    v_cat_ok     BOOLEAN;
BEGIN
    IF p_description IS NULL OR btrim(p_description) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Description is required.');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A valid amount is required.');
    END IF;

    -- Category is required and must belong to this school.
    SELECT EXISTS (
        SELECT 1 FROM expense_categories
         WHERE id = p_category_id AND school_id = p_school_id
    ) INTO v_cat_ok;

    IF NOT v_cat_ok THEN
        RETURN jsonb_build_object('success', false, 'error', 'Please choose a category for this expense.');
    END IF;

    INSERT INTO expenses (
        id, school_id, description, amount, expense_date, category_id,
        vendor_name, invoice_number, payment_method
    ) VALUES (
        v_expense_id, p_school_id, btrim(p_description), p_amount,
        COALESCE(p_expense_date, CURRENT_DATE), p_category_id,
        NULLIF(p_vendor_name, ''), NULLIF(p_invoice_number, ''),
        COALESCE(NULLIF(p_payment_method, ''), 'cash')
    );
    -- trg_post_expense posts the balanced double-entry to the ledger.

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'record_expense', 'expense', v_expense_id,
            jsonb_build_object('amount', p_amount, 'category_id', p_category_id,
                               'description', btrim(p_description)));

    RETURN jsonb_build_object('success', true, 'expense_id', v_expense_id, 'amount', p_amount);
END;
$fn$;
