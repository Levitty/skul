-- ─────────────────────────────────────────────────────────────────
-- Migration 121: record_uniform_sale_basket() — one sale, many lines
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- record_uniform_sale (114) takes exactly one size. A parent buying a
-- sweater, a shirt and socks became three sales with three numbers and no
-- single receipt. uniform_sale_items always supported many lines; the RPC
-- and the till didn't.
--
-- WHAT
-- One header in uniform_sales, one row per line in uniform_sale_items,
-- all-or-nothing. Every line is stock-checked under lock before anything
-- is written, so a basket never half-succeeds.
--
-- STOCK
-- The database has a row trigger (update_stock_on_sale) that decrements
-- stock when a sale item is inserted. It predates this repo, so rather
-- than assume it, each line checks whether stock actually moved after the
-- insert and decrements + logs itself if it didn't. Works either way,
-- never double-counts.
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_uniform_sale_basket(
    p_school_id       UUID,
    p_lines           JSONB,                  -- [{"variant_id": "...", "quantity": 2}, ...]
    p_payment_method  TEXT    DEFAULT 'cash',
    p_sale_date       DATE    DEFAULT NULL,
    p_student_id      UUID    DEFAULT NULL,
    p_customer_name   TEXT    DEFAULT NULL,
    p_notes           TEXT    DEFAULT NULL,
    p_transaction_ref TEXT    DEFAULT NULL,
    p_user_id         UUID    DEFAULT NULL,
    p_user_email      TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_row       JSONB;
    v_vid       UUID;
    v_qty       INTEGER;
    v_wanted    JSONB := '{}'::jsonb;      -- variant_id → summed quantity
    v_key       TEXT;
    v_var       RECORD;
    v_unit      NUMERIC(12,2);
    v_line      NUMERIC(12,2);
    v_total     NUMERIC(12,2) := 0;
    v_lines     JSONB := '[]'::jsonb;      -- resolved lines to write
    v_summary   TEXT := '';
    v_sale_id   UUID;
    v_sale_no   TEXT;
    v_method    TEXT := COALESCE(NULLIF(TRIM(p_payment_method), ''), 'cash');
    v_date      DATE := COALESCE(p_sale_date, (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE);
    v_before    INTEGER;
    v_after     INTEGER;
    v_n         INTEGER := 0;
BEGIN
    IF p_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'School is required.');
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Add at least one item to the sale.');
    END IF;

    -- Fold duplicate lines (same size twice) into one quantity.
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_key := NULLIF(TRIM(COALESCE(v_row->>'variant_id', '')), '');
        v_qty := GREATEST(0, COALESCE((v_row->>'quantity')::int, 0));
        IF v_key IS NULL OR v_qty = 0 THEN CONTINUE; END IF;
        v_wanted := v_wanted || jsonb_build_object(v_key, COALESCE((v_wanted->>v_key)::int, 0) + v_qty);
    END LOOP;
    IF v_wanted = '{}'::jsonb THEN
        RETURN jsonb_build_object('success', false, 'error', 'Every line needs an item, a size and a quantity.');
    END IF;

    -- Validate and price every line under lock BEFORE writing anything.
    FOR v_key, v_qty IN SELECT key, value::int FROM jsonb_each_text(v_wanted) LOOP
        v_vid := v_key::uuid;
        SELECT v.id, v.size, v.price, v.stock_quantity, v.is_active,
               p.school_id AS product_school_id, p.name AS product_name,
               p.base_price, p.is_active AS product_active
          INTO v_var
          FROM uniform_variants v
          JOIN uniform_products p ON p.id = v.product_id
         WHERE v.id = v_vid
           FOR UPDATE OF v;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'One of the sizes no longer exists.');
        END IF;
        IF v_var.product_school_id IS DISTINCT FROM p_school_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item does not belong to this school.');
        END IF;
        IF COALESCE(v_var.is_active, true) IS NOT TRUE OR COALESCE(v_var.product_active, true) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', v_var.product_name || ' (' || v_var.size || ') is not sellable.');
        END IF;
        IF COALESCE(v_var.stock_quantity, 0) < v_qty THEN
            RETURN jsonb_build_object('success', false, 'error',
                'Not enough ' || v_var.product_name || ' (' || v_var.size || '): have '
                || COALESCE(v_var.stock_quantity, 0)::text || ', need ' || v_qty::text || '.');
        END IF;
        v_unit := round(COALESCE(v_var.price, v_var.base_price, 0), 2);
        IF v_unit <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', v_var.product_name || ' (' || v_var.size || ') has no price.');
        END IF;
        v_line  := round(v_unit * v_qty, 2);
        v_total := v_total + v_line;
        v_n     := v_n + 1;
        v_lines := v_lines || jsonb_build_object(
            'variant_id', v_vid, 'quantity', v_qty, 'unit_price', v_unit, 'total_price', v_line,
            'label', v_var.product_name || ' · ' || v_var.size || ' ×' || v_qty
        );
        v_summary := v_summary || CASE WHEN v_summary = '' THEN '' ELSE ', ' END
                   || v_var.product_name || ' · ' || v_var.size || ' ×' || v_qty;
    END LOOP;

    -- Sale number: the school's own sequence when available.
    BEGIN
        v_sale_no := generate_sale_number(p_school_id);
    EXCEPTION WHEN OTHERS THEN
        v_sale_no := 'U' || to_char(v_date, 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
    END;

    INSERT INTO uniform_sales (
        school_id, sale_number, student_id, customer_name, total_amount,
        payment_method, transaction_ref, sale_date, sold_by, notes
    ) VALUES (
        p_school_id, v_sale_no, p_student_id,
        NULLIF(TRIM(COALESCE(p_customer_name, '')), ''), v_total,
        v_method, NULLIF(TRIM(COALESCE(p_transaction_ref, '')), ''), v_date, p_user_id,
        CASE WHEN NULLIF(TRIM(COALESCE(p_notes, '')), '') IS NULL THEN v_summary
             ELSE v_summary || ' — ' || TRIM(p_notes) END
    )
    RETURNING id INTO v_sale_id;

    -- Lines. Stock moves via the existing trigger if it's there; otherwise here.
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
        v_vid := (v_row->>'variant_id')::uuid;
        v_qty := (v_row->>'quantity')::int;

        SELECT stock_quantity INTO v_before FROM uniform_variants WHERE id = v_vid;

        INSERT INTO uniform_sale_items (sale_id, variant_id, quantity, unit_price, total_price)
        VALUES (v_sale_id, v_vid, v_qty, (v_row->>'unit_price')::numeric, (v_row->>'total_price')::numeric);

        SELECT stock_quantity INTO v_after FROM uniform_variants WHERE id = v_vid;

        IF COALESCE(v_after, 0) = COALESCE(v_before, 0) THEN
            UPDATE uniform_variants
               SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_qty), updated_at = NOW()
             WHERE id = v_vid;
            INSERT INTO stock_adjustments (variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by)
            VALUES (v_vid, 'sale', -v_qty, COALESCE(v_before, 0), GREATEST(0, COALESCE(v_before, 0) - v_qty),
                    'Sale ' || v_sale_no, p_user_id);
        END IF;
    END LOOP;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'create', 'uniform_sale', v_sale_id,
            jsonb_build_object('sale_number', v_sale_no, 'amount', v_total, 'lines', v_n,
                               'method', v_method, 'student_id', p_student_id));

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'sale_number', v_sale_no,
                              'total_amount', v_total, 'lines', v_n);
EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock would go negative — receive stock first.');
WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$fn$;

GRANT EXECUTE ON FUNCTION record_uniform_sale_basket(UUID, JSONB, TEXT, DATE, UUID, TEXT, TEXT, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION record_uniform_sale_basket IS
    'One uniform sale with many lines: validates and prices every line under lock, writes header + items atomically.';
