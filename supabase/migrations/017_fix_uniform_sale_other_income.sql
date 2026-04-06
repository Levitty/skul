-- Fix: avoid uniform sale failures when finance tables are missing
-- This updates the trigger function to safely skip other_income creation
-- if chart_of_accounts or other_income tables do not exist.

CREATE OR REPLACE FUNCTION create_other_income_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_income_id UUID;
    v_account_id UUID;
    v_has_chart BOOLEAN;
    v_has_income BOOLEAN;
BEGIN
    -- Check if required finance tables exist
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'chart_of_accounts'
    ) INTO v_has_chart;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'other_income'
    ) INTO v_has_income;

    -- If finance tables are missing, skip creating other_income
    IF NOT v_has_chart OR NOT v_has_income THEN
        RETURN NEW;
    END IF;

    -- Get Uniform Sales Revenue account (4600)
    EXECUTE
        'SELECT id FROM chart_of_accounts WHERE school_id = $1 AND account_code = $2 LIMIT 1'
    INTO v_account_id
    USING NEW.school_id, '4600';

    -- If no account found, skip other_income creation
    IF v_account_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Create other_income entry
    INSERT INTO other_income (
        school_id,
        income_type,
        student_id,
        description,
        amount,
        payment_method,
        transaction_ref,
        received_date,
        account_id,
        created_by
    ) VALUES (
        NEW.school_id,
        'uniform_sale',
        NEW.student_id,
        'Uniform Sale: ' || NEW.sale_number,
        NEW.total_amount,
        NEW.payment_method,
        NEW.transaction_ref,
        NEW.sale_date,
        v_account_id,
        NEW.sold_by
    ) RETURNING id INTO v_income_id;

    -- Link sale to other_income
    UPDATE uniform_sales
    SET other_income_id = v_income_id
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger still points to the updated function
DROP TRIGGER IF EXISTS trigger_create_other_income_on_sale ON uniform_sales;
CREATE TRIGGER trigger_create_other_income_on_sale
    AFTER INSERT ON uniform_sales
    FOR EACH ROW
    EXECUTE FUNCTION create_other_income_on_sale();
