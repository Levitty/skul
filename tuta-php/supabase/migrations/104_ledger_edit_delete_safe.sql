-- ─────────────────────────────────────────────────────────────────
-- Migration 104: make expense & income ledger postings edit/delete-safe
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- BUG THIS FIXES (verified 2026-08-11)
-- trg_ledger_expense and trg_ledger_income fired AFTER INSERT ONLY, but
-- expenses.php and income.php both support edit and delete. So:
--   • editing an expense/income left the ledger showing the OLD amount
--   • deleting one left its ledger entry in place
-- → the P&L silently drifted from the finance lists. (Insert always posted fine.)
--
-- WHY A TRIGGER-LEVEL FIX, AND WHY REVERSING ENTRIES
-- Posting lives in triggers by design ("can't be bypassed by any code path").
-- We can't fix this by merely also firing on UPDATE, because post_journal() is
-- idempotent per (source_type, source_id) — on an update it would return the
-- existing entry unchanged. So we REVERSE then RE-POST, the same approach the
-- existing trg_post_uniform_sale already uses for deletes ('uniform_sale_void').
--
-- Never delete a posting — always post a counter-entry, so the ledger keeps a
-- full trail: original → reversal → re-post.
--   • DELETE  → one reversing entry (source_type '<x>_void', source_id = row id)
--   • UPDATE  → reverse the OLD values + post the NEW values, as adjustment
--               entries with source_id = NULL. NULL source_id bypasses the
--               idempotency guard, so a row can be edited any number of times
--               and each edit posts its own correcting pair. Net over all
--               entries for a row always equals its current value (0 once deleted).
--
-- Idempotent to run (CREATE OR REPLACE + DROP/CREATE TRIGGER).
-- ─────────────────────────────────────────────────────────────────

-- ══ EXPENSE ══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_post_expense()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_acct TEXT; v_cash TEXT; v_lines JSONB;
    v_oacct TEXT; v_ocash TEXT;
BEGIN
    -- ── INSERT: expense account up, cash down (unchanged behaviour) ──
    IF TG_OP = 'INSERT' THEN
        BEGIN
            SELECT COALESCE(account_code,'5900') INTO v_acct FROM expense_categories WHERE id = NEW.category_id;
            v_acct := COALESCE(v_acct,'5900');
            v_cash := cash_account_code(NEW.payment_method);
            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_acct,'debit',NEW.amount,'credit',0,'memo',NEW.description),
                jsonb_build_object('code',v_cash,'debit',0,'credit',NEW.amount,'memo','Expense paid'));
            PERFORM post_journal(NEW.school_id, NEW.expense_date,
                'Expense: ' || COALESCE(NEW.description,''), 'expense', NEW.id, v_lines);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO ledger_errors (school_id, source_type, source_id, error)
            VALUES (NEW.school_id, 'expense', NEW.id, SQLERRM);
        END;
        RETURN NEW;
    END IF;

    -- ── DELETE: reverse the current posting ──
    IF TG_OP = 'DELETE' THEN
        BEGIN
            SELECT COALESCE(account_code,'5900') INTO v_oacct FROM expense_categories WHERE id = OLD.category_id;
            v_oacct := COALESCE(v_oacct,'5900');
            v_ocash := cash_account_code(OLD.payment_method);
            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_ocash,'debit',OLD.amount,'credit',0,'memo','Reverse deleted expense'),
                jsonb_build_object('code',v_oacct,'debit',0,'credit',OLD.amount,'memo',OLD.description));
            PERFORM post_journal(OLD.school_id, CURRENT_DATE,
                'Delete expense: ' || COALESCE(OLD.description,''), 'expense_void', OLD.id, v_lines);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO ledger_errors (school_id, source_type, source_id, error)
            VALUES (OLD.school_id, 'expense_void', OLD.id, SQLERRM);
        END;
        RETURN OLD;
    END IF;

    -- ── UPDATE: only if a money-relevant field changed → reverse OLD, post NEW ──
    IF OLD.amount         IS DISTINCT FROM NEW.amount
       OR OLD.category_id IS DISTINCT FROM NEW.category_id
       OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
       OR OLD.expense_date IS DISTINCT FROM NEW.expense_date THEN
        BEGIN
            -- reverse OLD (source_id NULL → not deduped, so re-edits keep working)
            SELECT COALESCE(account_code,'5900') INTO v_oacct FROM expense_categories WHERE id = OLD.category_id;
            v_oacct := COALESCE(v_oacct,'5900');
            v_ocash := cash_account_code(OLD.payment_method);
            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_ocash,'debit',OLD.amount,'credit',0,'memo','Reverse (edit)'),
                jsonb_build_object('code',v_oacct,'debit',0,'credit',OLD.amount,'memo',OLD.description));
            PERFORM post_journal(NEW.school_id, NEW.expense_date,
                'Edit reverse expense: ' || COALESCE(OLD.description,''), 'expense_edit', NULL, v_lines);
            -- post NEW
            SELECT COALESCE(account_code,'5900') INTO v_acct FROM expense_categories WHERE id = NEW.category_id;
            v_acct := COALESCE(v_acct,'5900');
            v_cash := cash_account_code(NEW.payment_method);
            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_acct,'debit',NEW.amount,'credit',0,'memo',NEW.description),
                jsonb_build_object('code',v_cash,'debit',0,'credit',NEW.amount,'memo','Expense paid (edit)'));
            PERFORM post_journal(NEW.school_id, NEW.expense_date,
                'Edit expense: ' || COALESCE(NEW.description,''), 'expense_edit', NULL, v_lines);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO ledger_errors (school_id, source_type, source_id, error)
            VALUES (NEW.school_id, 'expense_edit', NEW.id, SQLERRM);
        END;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ledger_expense ON expenses;
CREATE TRIGGER trg_ledger_expense
    AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION trg_post_expense();

-- ══ INCOME ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_post_income()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_acct TEXT; v_lines JSONB; v_oacct TEXT;
BEGIN
    -- ── INSERT: cash up, income account up (unchanged behaviour) ──
    IF TG_OP = 'INSERT' THEN
        BEGIN
            SELECT COALESCE(account_code,'4100') INTO v_acct FROM income_categories WHERE id = NEW.category_id;
            v_acct := COALESCE(v_acct,'4100');
            v_lines := jsonb_build_array(
                jsonb_build_object('code','1010','debit',NEW.amount,'credit',0,'memo','Income received'),
                jsonb_build_object('code',v_acct,'debit',0,'credit',NEW.amount,'memo',NEW.description));
            PERFORM post_journal(NEW.school_id, NEW.date,
                'Income: ' || COALESCE(NEW.description,''), 'income', NEW.id, v_lines);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO ledger_errors (school_id, source_type, source_id, error)
            VALUES (NEW.school_id, 'income', NEW.id, SQLERRM);
        END;
        RETURN NEW;
    END IF;

    -- ── DELETE: reverse the current posting ──
    IF TG_OP = 'DELETE' THEN
        BEGIN
            SELECT COALESCE(account_code,'4100') INTO v_oacct FROM income_categories WHERE id = OLD.category_id;
            v_oacct := COALESCE(v_oacct,'4100');
            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_oacct,'debit',OLD.amount,'credit',0,'memo','Reverse deleted income'),
                jsonb_build_object('code','1010','debit',0,'credit',OLD.amount,'memo',OLD.description));
            PERFORM post_journal(OLD.school_id, CURRENT_DATE,
                'Delete income: ' || COALESCE(OLD.description,''), 'income_void', OLD.id, v_lines);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO ledger_errors (school_id, source_type, source_id, error)
            VALUES (OLD.school_id, 'income_void', OLD.id, SQLERRM);
        END;
        RETURN OLD;
    END IF;

    -- ── UPDATE: reverse OLD, post NEW (money-relevant fields only) ──
    IF OLD.amount        IS DISTINCT FROM NEW.amount
       OR OLD.category_id IS DISTINCT FROM NEW.category_id
       OR OLD.date        IS DISTINCT FROM NEW.date THEN
        BEGIN
            SELECT COALESCE(account_code,'4100') INTO v_oacct FROM income_categories WHERE id = OLD.category_id;
            v_oacct := COALESCE(v_oacct,'4100');
            v_lines := jsonb_build_array(
                jsonb_build_object('code',v_oacct,'debit',OLD.amount,'credit',0,'memo','Reverse (edit)'),
                jsonb_build_object('code','1010','debit',0,'credit',OLD.amount,'memo',OLD.description));
            PERFORM post_journal(NEW.school_id, NEW.date,
                'Edit reverse income: ' || COALESCE(OLD.description,''), 'income_edit', NULL, v_lines);
            SELECT COALESCE(account_code,'4100') INTO v_acct FROM income_categories WHERE id = NEW.category_id;
            v_acct := COALESCE(v_acct,'4100');
            v_lines := jsonb_build_array(
                jsonb_build_object('code','1010','debit',NEW.amount,'credit',0,'memo','Income received (edit)'),
                jsonb_build_object('code',v_acct,'debit',0,'credit',NEW.amount,'memo',NEW.description));
            PERFORM post_journal(NEW.school_id, NEW.date,
                'Edit income: ' || COALESCE(NEW.description,''), 'income_edit', NULL, v_lines);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO ledger_errors (school_id, source_type, source_id, error)
            VALUES (NEW.school_id, 'income_edit', NEW.id, SQLERRM);
        END;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ledger_income ON income;
CREATE TRIGGER trg_ledger_income
    AFTER INSERT OR UPDATE OR DELETE ON income
    FOR EACH ROW EXECUTE FUNCTION trg_post_income();
