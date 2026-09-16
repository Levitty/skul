-- Migration 114: Uniform variants (size prices + stock) + group stock transfers
-- Run in Supabase SQL Editor, then reload schema cache.
--
-- • Soft-defaults for variants (color Standard)
-- • stock_adjustments: transfer_out / transfer_in
-- • Drop legacy other_income-on-sale trigger (GL already posts uniform sales)
-- • record_uniform_sale RPC (sale header + items → stock via existing trigger)
-- • adjust_uniform_stock RPC (set absolute qty with audit)
-- • stock_transfers / stock_transfer_items + send / receive / cancel RPCs
--   (across school_group sibling schools; match dest product by name + size)

-- ── 1. Variant defaults ──────────────────────────────────────────

ALTER TABLE uniform_variants ALTER COLUMN color SET DEFAULT 'Standard';
UPDATE uniform_variants SET color = 'Standard' WHERE color IS NULL OR TRIM(color) = '';

-- ── 2. stock_adjustments: transfer types ─────────────────────────

ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments
    ADD CONSTRAINT stock_adjustments_adjustment_type_check
    CHECK (adjustment_type IN (
        'purchase', 'sale', 'return', 'damaged', 'adjustment',
        'transfer_out', 'transfer_in'
    ));

-- ── 3. Drop broken other_income trigger (ledger handles sales) ───

DROP TRIGGER IF EXISTS trigger_create_other_income_on_sale ON uniform_sales;
DROP FUNCTION IF EXISTS create_other_income_on_sale();

-- ── 4. Transfer tables ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_transfers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id        UUID NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    from_school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    to_school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    transfer_number TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'received', 'cancelled')),
    notes           TEXT,
    sent_by         UUID,
    sent_at         TIMESTAMPTZ DEFAULT NOW(),
    received_by     UUID,
    received_at     TIMESTAMPTZ,
    cancelled_by    UUID,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT stock_transfers_schools_diff CHECK (from_school_id <> to_school_id),
    UNIQUE (group_id, transfer_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from
    ON stock_transfers (from_school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to
    ON stock_transfers (to_school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_group
    ON stock_transfers (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id      UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    from_variant_id  UUID NOT NULL REFERENCES uniform_variants(id),
    to_variant_id    UUID REFERENCES uniform_variants(id),
    product_name     TEXT NOT NULL,
    size             TEXT NOT NULL,
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer
    ON stock_transfer_items (transfer_id);

ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "srv_stock_transfers" ON stock_transfers;
DROP POLICY IF EXISTS "srv_stock_transfer_items" ON stock_transfer_items;
CREATE POLICY "srv_stock_transfers" ON stock_transfers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "srv_stock_transfer_items" ON stock_transfer_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5. record_uniform_sale ───────────────────────────────────────

CREATE OR REPLACE FUNCTION record_uniform_sale(
    p_school_id      UUID,
    p_variant_id     UUID,
    p_quantity       INTEGER,
    p_payment_method TEXT DEFAULT 'cash',
    p_sale_date      DATE DEFAULT NULL,
    p_student_id     UUID DEFAULT NULL,
    p_customer_name  TEXT DEFAULT NULL,
    p_notes          TEXT DEFAULT NULL,
    p_user_id        UUID DEFAULT NULL,
    p_user_email     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_prod       RECORD;
    v_var        RECORD;
    v_qty        INTEGER := GREATEST(1, COALESCE(p_quantity, 1));
    v_unit       NUMERIC(12,2);
    v_total      NUMERIC(12,2);
    v_sale_id    UUID;
    v_sale_no    TEXT;
    v_method     TEXT := COALESCE(NULLIF(TRIM(p_payment_method), ''), 'cash');
    v_date       DATE := COALESCE(p_sale_date, (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE);
    v_summary    TEXT;
BEGIN
    IF p_school_id IS NULL OR p_variant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'School and variant are required.');
    END IF;

    SELECT v.*, p.school_id AS product_school_id, p.name AS product_name,
           p.base_price, p.is_active AS product_active
      INTO v_var
      FROM uniform_variants v
      JOIN uniform_products p ON p.id = v.product_id
     WHERE v.id = p_variant_id
       FOR UPDATE OF v;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Size / variant not found.');
    END IF;

    IF v_var.product_school_id IS DISTINCT FROM p_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Variant does not belong to this school.');
    END IF;

    IF COALESCE(v_var.is_active, true) IS NOT TRUE OR COALESCE(v_var.product_active, true) IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'This item or size is not sellable.');
    END IF;

    IF COALESCE(v_var.stock_quantity, 0) < v_qty THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Not enough stock for ' || v_var.product_name || ' (' || v_var.size || '). Have '
            || COALESCE(v_var.stock_quantity, 0)::text || ', need ' || v_qty::text || '.');
    END IF;

    v_unit  := round(COALESCE(v_var.price, v_var.base_price, 0), 2);
    v_total := round(v_unit * v_qty, 2);
    IF v_unit <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Price must be greater than zero.');
    END IF;

    -- Prefer generate_sale_number if present; else simple code.
    BEGIN
        v_sale_no := generate_sale_number(p_school_id);
    EXCEPTION WHEN OTHERS THEN
        v_sale_no := 'U' || to_char(v_date, 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
    END;

    v_summary := v_var.product_name || ' · ' || v_var.size || ' ×' || v_qty;

    INSERT INTO uniform_sales (
        school_id, sale_number, student_id, customer_name,
        total_amount, payment_method, sale_date, sold_by, notes
    ) VALUES (
        p_school_id, v_sale_no, p_student_id,
        NULLIF(TRIM(COALESCE(p_customer_name, '')), ''),
        v_total, v_method, v_date, p_user_id,
        CASE
            WHEN NULLIF(TRIM(COALESCE(p_notes, '')), '') IS NULL THEN v_summary
            ELSE v_summary || ' — ' || TRIM(p_notes)
        END
    )
    RETURNING id INTO v_sale_id;

    -- Trigger update_stock_on_sale decrements stock + logs 'sale'.
    INSERT INTO uniform_sale_items (sale_id, variant_id, quantity, unit_price, total_price)
    VALUES (v_sale_id, p_variant_id, v_qty, v_unit, v_total);

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'create', 'uniform_sale', v_sale_id,
            jsonb_build_object('sale_number', v_sale_no, 'amount', v_total,
                               'variant_id', p_variant_id, 'quantity', v_qty));

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'sale_number', v_sale_no,
        'total_amount', v_total,
        'unit_price', v_unit
    );
EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock would go negative — receive stock first.');
WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$fn$;

GRANT EXECUTE ON FUNCTION record_uniform_sale(UUID, UUID, INTEGER, TEXT, DATE, UUID, TEXT, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 6. adjust_uniform_stock (set absolute quantity) ──────────────

CREATE OR REPLACE FUNCTION adjust_uniform_stock(
    p_school_id    UUID,
    p_variant_id   UUID,
    p_new_quantity INTEGER,
    p_reason       TEXT DEFAULT 'Stock count',
    p_user_id      UUID DEFAULT NULL,
    p_user_email   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_var     RECORD;
    v_prev    INTEGER;
    v_new     INTEGER := GREATEST(0, COALESCE(p_new_quantity, 0));
    v_delta   INTEGER;
    v_type    TEXT;
BEGIN
    SELECT v.*, p.school_id AS product_school_id, p.name AS product_name
      INTO v_var
      FROM uniform_variants v
      JOIN uniform_products p ON p.id = v.product_id
     WHERE v.id = p_variant_id
       FOR UPDATE OF v;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Variant not found.');
    END IF;
    IF v_var.product_school_id IS DISTINCT FROM p_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Variant does not belong to this school.');
    END IF;

    v_prev  := COALESCE(v_var.stock_quantity, 0);
    v_delta := v_new - v_prev;
    IF v_delta = 0 THEN
        RETURN jsonb_build_object('success', true, 'stock_quantity', v_new, 'unchanged', true);
    END IF;

    v_type := CASE WHEN v_delta > 0 THEN 'purchase' ELSE 'adjustment' END;

    UPDATE uniform_variants
       SET stock_quantity = v_new, updated_at = NOW()
     WHERE id = p_variant_id;

    INSERT INTO stock_adjustments (
        variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by
    ) VALUES (
        p_variant_id, v_type, v_delta, v_prev, v_new,
        COALESCE(NULLIF(TRIM(p_reason), ''), 'Stock count'), p_user_id
    );

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'adjust_stock', 'uniform_variant', p_variant_id,
            jsonb_build_object('previous', v_prev, 'new', v_new, 'product', v_var.product_name, 'size', v_var.size));

    RETURN jsonb_build_object('success', true, 'stock_quantity', v_new, 'previous', v_prev);
END;
$fn$;

GRANT EXECUTE ON FUNCTION adjust_uniform_stock(UUID, UUID, INTEGER, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 7. upsert_uniform_variant (size + price; keep stock) ─────────

CREATE OR REPLACE FUNCTION upsert_uniform_variant(
    p_school_id UUID,
    p_product_id UUID,
    p_size TEXT,
    p_price NUMERIC,
    p_stock_quantity INTEGER DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_user_id UUID DEFAULT NULL,
    p_user_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_prod   RECORD;
    v_id     UUID;
    v_prev   INTEGER;
    v_stock  INTEGER;
    v_size   TEXT := UPPER(TRIM(COALESCE(p_size, '')));
BEGIN
    IF v_size NOT IN ('XS','S','M','L','XL','XXL','XXXL') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid size.');
    END IF;
    IF p_price IS NULL OR p_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Price is required.');
    END IF;

    SELECT id, school_id, name, base_price INTO v_prod
      FROM uniform_products
     WHERE id = p_product_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found.');
    END IF;

    SELECT id, stock_quantity INTO v_id, v_prev
      FROM uniform_variants
     WHERE product_id = p_product_id AND size = v_size AND color = 'Standard'
     LIMIT 1;

    IF v_id IS NULL THEN
        v_stock := GREATEST(0, COALESCE(p_stock_quantity, 0));
        INSERT INTO uniform_variants (product_id, size, color, price, stock_quantity, is_active)
        VALUES (p_product_id, v_size, 'Standard', round(p_price, 2), v_stock, COALESCE(p_is_active, true))
        RETURNING id INTO v_id;

        IF v_stock > 0 THEN
            INSERT INTO stock_adjustments (
                variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by
            ) VALUES (v_id, 'purchase', v_stock, 0, v_stock, 'Opening stock', p_user_id);
        END IF;
    ELSE
        UPDATE uniform_variants
           SET price = round(p_price, 2),
               is_active = COALESCE(p_is_active, true),
               updated_at = NOW()
         WHERE id = v_id;

        IF p_stock_quantity IS NOT NULL THEN
            PERFORM adjust_uniform_stock(
                p_school_id, v_id, GREATEST(0, p_stock_quantity),
                'Catalogue stock update', p_user_id, p_user_email
            );
        END IF;
    END IF;

    -- Keep product base_price as lowest active size price (display hint).
    UPDATE uniform_products p
       SET base_price = COALESCE((
               SELECT MIN(v.price) FROM uniform_variants v
                WHERE v.product_id = p.id AND COALESCE(v.is_active, true)
                  AND v.price IS NOT NULL AND v.price > 0
           ), p.base_price),
           updated_at = NOW()
     WHERE p.id = p_product_id;

    RETURN jsonb_build_object('success', true, 'variant_id', v_id, 'size', v_size);
END;
$fn$;

GRANT EXECUTE ON FUNCTION upsert_uniform_variant(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 8. send_stock_transfer ───────────────────────────────────────

CREATE OR REPLACE FUNCTION send_stock_transfer(
    p_from_school_id UUID,
    p_to_school_id   UUID,
    p_lines          JSONB,  -- [{"variant_id":"…","quantity":n},…]
    p_notes          TEXT DEFAULT NULL,
    p_user_id        UUID DEFAULT NULL,
    p_user_email     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_group_id UUID;
    v_to_group UUID;
    v_transfer_id UUID;
    v_number TEXT;
    v_seq INT;
    v_line JSONB;
    v_var RECORD;
    v_qty INTEGER;
    v_prev INTEGER;
    v_new INTEGER;
    v_count INT := 0;
BEGIN
    IF p_from_school_id IS NULL OR p_to_school_id IS NULL OR p_from_school_id = p_to_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pick a different destination school.');
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Add at least one line to transfer.');
    END IF;

    SELECT group_id INTO v_group_id
      FROM school_group_members WHERE school_id = p_from_school_id LIMIT 1;
    SELECT group_id INTO v_to_group
      FROM school_group_members WHERE school_id = p_to_school_id LIMIT 1;

    IF v_group_id IS NULL OR v_to_group IS NULL OR v_group_id IS DISTINCT FROM v_to_group THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Both schools must belong to the same group.');
    END IF;

    SELECT COALESCE(MAX(
        NULLIF(regexp_replace(transfer_number, '^TR-[0-9]{4}-', ''), '')::INT
    ), 0) + 1
      INTO v_seq
      FROM stock_transfers
     WHERE group_id = v_group_id
       AND transfer_number ~ ('^TR-' || to_char(NOW(), 'YYYY') || '-[0-9]+$');

    v_number := 'TR-' || to_char(NOW(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');

    INSERT INTO stock_transfers (
        group_id, from_school_id, to_school_id, transfer_number,
        status, notes, sent_by, sent_at
    ) VALUES (
        v_group_id, p_from_school_id, p_to_school_id, v_number,
        'sent', NULLIF(TRIM(COALESCE(p_notes, '')), ''), p_user_id, NOW()
    )
    RETURNING id INTO v_transfer_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_qty := GREATEST(1, COALESCE((v_line->>'quantity')::INT, 0));

        SELECT v.*, p.name AS product_name, p.school_id AS product_school_id
          INTO v_var
          FROM uniform_variants v
          JOIN uniform_products p ON p.id = v.product_id
         WHERE v.id = (v_line->>'variant_id')::UUID
           FOR UPDATE OF v;

        IF NOT FOUND OR v_var.product_school_id IS DISTINCT FROM p_from_school_id THEN
            RAISE EXCEPTION 'Invalid source variant on a transfer line.';
        END IF;

        v_prev := COALESCE(v_var.stock_quantity, 0);
        IF v_prev < v_qty THEN
            RAISE EXCEPTION 'Not enough stock for % (%) — have %, need %.',
                v_var.product_name, v_var.size, v_prev, v_qty;
        END IF;

        v_new := v_prev - v_qty;
        UPDATE uniform_variants
           SET stock_quantity = v_new, updated_at = NOW()
         WHERE id = v_var.id;

        INSERT INTO stock_adjustments (
            variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by
        ) VALUES (
            v_var.id, 'transfer_out', -v_qty, v_prev, v_new,
            'Transfer ' || v_number || ' → in transit', p_user_id
        );

        INSERT INTO stock_transfer_items (
            transfer_id, from_variant_id, product_name, size, quantity
        ) VALUES (
            v_transfer_id, v_var.id, v_var.product_name, v_var.size, v_qty
        );

        v_count := v_count + 1;
    END LOOP;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_from_school_id, p_user_id, p_user_email, 'send', 'stock_transfer', v_transfer_id,
            jsonb_build_object('transfer_number', v_number, 'to_school_id', p_to_school_id,
                               'lines', v_count));

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', v_transfer_id,
        'transfer_number', v_number,
        'lines', v_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$fn$;

GRANT EXECUTE ON FUNCTION send_stock_transfer(UUID, UUID, JSONB, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 9. receive_stock_transfer ────────────────────────────────────

CREATE OR REPLACE FUNCTION receive_stock_transfer(
    p_transfer_id  UUID,
    p_school_id    UUID,  -- must be destination
    p_user_id      UUID DEFAULT NULL,
    p_user_email   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_tr      RECORD;
    v_item    RECORD;
    v_prod_id UUID;
    v_var_id  UUID;
    v_prev    INTEGER;
    v_new     INTEGER;
    v_base    NUMERIC(12,2);
BEGIN
    SELECT * INTO v_tr
      FROM stock_transfers
     WHERE id = p_transfer_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer not found.');
    END IF;
    IF v_tr.to_school_id IS DISTINCT FROM p_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only the destination school can receive this transfer.');
    END IF;
    IF v_tr.status = 'received' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already received.');
    END IF;
    IF v_tr.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer was cancelled.');
    END IF;
    IF v_tr.status <> 'sent' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer cannot be received.');
    END IF;

    FOR v_item IN
        SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        -- Match destination product by case-insensitive name.
        SELECT id, base_price INTO v_prod_id, v_base
          FROM uniform_products
         WHERE school_id = p_school_id
           AND lower(trim(name)) = lower(trim(v_item.product_name))
         LIMIT 1;

        IF v_prod_id IS NULL THEN
            -- Create catalogue item at destination (inactive sizes aside — product active).
            SELECT COALESCE(v.price, p.base_price, 0) INTO v_base
              FROM uniform_variants v
              JOIN uniform_products p ON p.id = v.product_id
             WHERE v.id = v_item.from_variant_id;

            INSERT INTO uniform_products (school_id, name, category, base_price, is_active)
            VALUES (p_school_id, v_item.product_name, 'uniform', COALESCE(NULLIF(v_base, 0), 0), true)
            RETURNING id, base_price INTO v_prod_id, v_base;
        END IF;

        SELECT id, stock_quantity INTO v_var_id, v_prev
          FROM uniform_variants
         WHERE product_id = v_prod_id AND size = v_item.size AND color = 'Standard'
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE;

        IF v_var_id IS NULL THEN
            SELECT COALESCE(v.price, p.base_price, 0) INTO v_base
              FROM uniform_variants v
              JOIN uniform_products p ON p.id = v.product_id
             WHERE v.id = v_item.from_variant_id;

            INSERT INTO uniform_variants (product_id, size, color, price, stock_quantity, is_active)
            VALUES (v_prod_id, v_item.size, 'Standard', COALESCE(NULLIF(v_base, 0), 0), 0, true)
            RETURNING id, stock_quantity INTO v_var_id, v_prev;
            v_prev := 0;
        END IF;

        v_new := COALESCE(v_prev, 0) + v_item.quantity;
        UPDATE uniform_variants
           SET stock_quantity = v_new, updated_at = NOW()
         WHERE id = v_var_id;

        INSERT INTO stock_adjustments (
            variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by
        ) VALUES (
            v_var_id, 'transfer_in', v_item.quantity, COALESCE(v_prev, 0), v_new,
            'Transfer ' || v_tr.transfer_number || ' received', p_user_id
        );

        UPDATE stock_transfer_items
           SET to_variant_id = v_var_id
         WHERE id = v_item.id;
    END LOOP;

    UPDATE stock_transfers
       SET status = 'received', received_by = p_user_id, received_at = NOW()
     WHERE id = p_transfer_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'receive', 'stock_transfer', p_transfer_id,
            jsonb_build_object('transfer_number', v_tr.transfer_number,
                               'from_school_id', v_tr.from_school_id));

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', p_transfer_id,
        'transfer_number', v_tr.transfer_number
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$fn$;

GRANT EXECUTE ON FUNCTION receive_stock_transfer(UUID, UUID, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 10. cancel_stock_transfer (while in transit) ─────────────────

CREATE OR REPLACE FUNCTION cancel_stock_transfer(
    p_transfer_id UUID,
    p_school_id   UUID,  -- must be source
    p_reason      TEXT DEFAULT NULL,
    p_user_id     UUID DEFAULT NULL,
    p_user_email  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_tr   RECORD;
    v_item RECORD;
    v_prev INTEGER;
    v_new  INTEGER;
BEGIN
    SELECT * INTO v_tr FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer not found.');
    END IF;
    IF v_tr.from_school_id IS DISTINCT FROM p_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only the sending school can cancel.');
    END IF;
    IF v_tr.status <> 'sent' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only in-transit transfers can be cancelled.');
    END IF;

    FOR v_item IN
        SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
        SELECT stock_quantity INTO v_prev
          FROM uniform_variants WHERE id = v_item.from_variant_id FOR UPDATE;
        v_new := COALESCE(v_prev, 0) + v_item.quantity;
        UPDATE uniform_variants
           SET stock_quantity = v_new, updated_at = NOW()
         WHERE id = v_item.from_variant_id;

        INSERT INTO stock_adjustments (
            variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by
        ) VALUES (
            v_item.from_variant_id, 'transfer_in', v_item.quantity, COALESCE(v_prev, 0), v_new,
            'Cancel transfer ' || v_tr.transfer_number, p_user_id
        );
    END LOOP;

    UPDATE stock_transfers
       SET status = 'cancelled', cancelled_by = p_user_id, cancelled_at = NOW(),
           cancel_reason = NULLIF(TRIM(COALESCE(p_reason, '')), '')
     WHERE id = p_transfer_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'cancel', 'stock_transfer', p_transfer_id,
            jsonb_build_object('transfer_number', v_tr.transfer_number, 'reason', p_reason));

    RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$fn$;

GRANT EXECUTE ON FUNCTION cancel_stock_transfer(UUID, UUID, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION send_stock_transfer IS
    'Moves uniform stock from one group school to another (in transit until receive).';
COMMENT ON FUNCTION receive_stock_transfer IS
    'Destination school receives an in-transit transfer; matches/creates product by name + size.';
