-- ─────────────────────────────────────────────────────────────────
-- Migration 120: Uniform — cost per size, receive delivery, create item
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- The uniform pages tracked selling price per size but cost only per item,
-- and the only way to put stock on the shelf was to overwrite a number in
-- the catalogue — no delivery record, no cost, nothing to reconcile.
--
-- WHAT
--   • uniform_variants.cost_price        — purchase price per size
--                                          (defaults from the item, overridable)
--   • stock_adjustments.unit_cost        — the cost on a purchase movement,
--                                          so stock value has a history
--   • receive_uniform_stock()            — a delivery: +qty, cost, note,
--                                          logged as 'purchase'
--   • create_uniform_item()              — item + sizes + opening stock in
--                                          one atomic call; no sizes → 'One size'
--   • upsert_uniform_variant()           — now carries cost_price and
--                                          reorder_level (signature change)
--
-- Idempotent. Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────

-- ── 1. Columns ────────────────────────────────────────────────────

ALTER TABLE uniform_variants   ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);
ALTER TABLE stock_adjustments  ADD COLUMN IF NOT EXISTS unit_cost  NUMERIC(12,2);

-- Backfill size cost from the item's cost where the size has none.
UPDATE uniform_variants v
   SET cost_price = p.cost_price
  FROM uniform_products p
 WHERE p.id = v.product_id
   AND v.cost_price IS NULL
   AND p.cost_price IS NOT NULL;

-- ── 2. receive_uniform_stock — a delivery ─────────────────────────

CREATE OR REPLACE FUNCTION receive_uniform_stock(
    p_school_id  UUID,
    p_variant_id UUID,
    p_quantity   INTEGER,
    p_unit_cost  NUMERIC  DEFAULT NULL,
    p_note       TEXT     DEFAULT NULL,
    p_user_id    UUID     DEFAULT NULL,
    p_user_email TEXT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_var   RECORD;
    v_prev  INTEGER;
    v_new   INTEGER;
    v_qty   INTEGER := COALESCE(p_quantity, 0);
    v_cost  NUMERIC(12,2);
BEGIN
    IF v_qty <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quantity received must be at least 1.');
    END IF;
    IF p_unit_cost IS NOT NULL AND p_unit_cost < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unit cost cannot be negative.');
    END IF;

    SELECT v.*, p.school_id AS product_school_id, p.name AS product_name, p.cost_price AS product_cost
      INTO v_var
      FROM uniform_variants v
      JOIN uniform_products p ON p.id = v.product_id
     WHERE v.id = p_variant_id
       FOR UPDATE OF v;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Size not found.');
    END IF;
    IF v_var.product_school_id IS DISTINCT FROM p_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Size does not belong to this school.');
    END IF;

    v_prev := COALESCE(v_var.stock_quantity, 0);
    v_new  := v_prev + v_qty;
    -- Cost on this delivery: what was typed, else the size's cost, else the item's.
    v_cost := COALESCE(p_unit_cost, v_var.cost_price, v_var.product_cost);

    UPDATE uniform_variants
       SET stock_quantity = v_new,
           cost_price     = COALESCE(p_unit_cost, cost_price),   -- latest delivery sets the cost
           updated_at     = NOW()
     WHERE id = p_variant_id;

    INSERT INTO stock_adjustments (
        variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by, unit_cost
    ) VALUES (
        p_variant_id, 'purchase', v_qty, v_prev, v_new,
        COALESCE(NULLIF(TRIM(p_note), ''), 'Delivery received'), p_user_id, v_cost
    );

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'receive_stock', 'uniform_variant', p_variant_id,
            jsonb_build_object('product', v_var.product_name, 'size', v_var.size,
                               'quantity', v_qty, 'unit_cost', v_cost, 'previous', v_prev, 'new', v_new));

    RETURN jsonb_build_object('success', true, 'stock_quantity', v_new, 'previous', v_prev,
                              'received', v_qty, 'unit_cost', v_cost);
END;
$fn$;

GRANT EXECUTE ON FUNCTION receive_uniform_stock(UUID, UUID, INTEGER, NUMERIC, TEXT, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 3. create_uniform_item — item + sizes + opening stock, atomically ─

CREATE OR REPLACE FUNCTION create_uniform_item(
    p_school_id     UUID,
    p_name          TEXT,
    p_cost_price    NUMERIC,
    p_price         NUMERIC,
    p_reorder_level INTEGER DEFAULT 0,
    p_sizes         JSONB   DEFAULT '[]'::jsonb,   -- [{"size":"28","quantity":12}, ...]
    p_user_id       UUID    DEFAULT NULL,
    p_user_email    TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_name    TEXT := TRIM(COALESCE(p_name, ''));
    v_pid     UUID;
    v_vid     UUID;
    v_row     JSONB;
    v_size    TEXT;
    v_qty     INTEGER;
    v_count   INTEGER := 0;
    v_units   INTEGER := 0;
    v_seen    TEXT[] := '{}';
BEGIN
    IF v_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item name is required.');
    END IF;
    IF p_price IS NULL OR p_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selling price must be greater than zero.');
    END IF;
    IF p_cost_price IS NOT NULL AND p_cost_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Purchase price cannot be negative.');
    END IF;
    IF EXISTS (SELECT 1 FROM uniform_products
                WHERE school_id = p_school_id AND lower(TRIM(name)) = lower(v_name)) THEN
        RETURN jsonb_build_object('success', false,
            'error', 'An item called "' || v_name || '" already exists. Open it and add sizes there.');
    END IF;

    INSERT INTO uniform_products (school_id, name, category, base_price, cost_price, is_active)
    VALUES (p_school_id, v_name, 'uniform', round(p_price, 2), round(COALESCE(p_cost_price, 0), 2), true)
    RETURNING id INTO v_pid;

    -- No sizes given → a single "One size" row so the till and stock work uniformly.
    IF p_sizes IS NULL OR jsonb_typeof(p_sizes) <> 'array' OR jsonb_array_length(p_sizes) = 0 THEN
        p_sizes := '[{"size":"One size","quantity":0}]'::jsonb;
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_sizes) LOOP
        v_size := TRIM(COALESCE(v_row->>'size', ''));
        v_qty  := GREATEST(0, COALESCE((v_row->>'quantity')::int, 0));
        IF v_size = '' THEN CONTINUE; END IF;
        IF length(v_size) > 20 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Size label "' || v_size || '" is too long (max 20).');
        END IF;
        IF lower(v_size) = ANY(v_seen) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Duplicate size "' || v_size || '".');
        END IF;
        v_seen := v_seen || lower(v_size);

        INSERT INTO uniform_variants (product_id, size, color, price, cost_price, stock_quantity, reorder_level, is_active)
        VALUES (v_pid, v_size, 'Standard', round(p_price, 2), round(COALESCE(p_cost_price, 0), 2),
                v_qty, GREATEST(0, COALESCE(p_reorder_level, 0)), true)
        RETURNING id INTO v_vid;

        IF v_qty > 0 THEN
            INSERT INTO stock_adjustments (
                variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by, unit_cost
            ) VALUES (v_vid, 'purchase', v_qty, 0, v_qty, 'Opening stock', p_user_id, round(COALESCE(p_cost_price, 0), 2));
        END IF;
        v_count := v_count + 1;
        v_units := v_units + v_qty;
    END LOOP;

    IF v_count = 0 THEN
        -- Every row was blank; fall back to One size.
        INSERT INTO uniform_variants (product_id, size, color, price, cost_price, stock_quantity, reorder_level, is_active)
        VALUES (v_pid, 'One size', 'Standard', round(p_price, 2), round(COALESCE(p_cost_price, 0), 2),
                0, GREATEST(0, COALESCE(p_reorder_level, 0)), true);
        v_count := 1;
    END IF;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'create', 'uniform_product', v_pid,
            jsonb_build_object('name', v_name, 'price', p_price, 'cost_price', p_cost_price,
                               'sizes', v_count, 'opening_units', v_units));

    RETURN jsonb_build_object('success', true, 'product_id', v_pid, 'sizes', v_count, 'units', v_units);
END;
$fn$;

GRANT EXECUTE ON FUNCTION create_uniform_item(UUID, TEXT, NUMERIC, NUMERIC, INTEGER, JSONB, UUID, TEXT)
    TO service_role, authenticated, anon;

-- ── 4. upsert_uniform_variant — now with cost_price + reorder_level ──
-- Signature changes, so the old one must go first (PostgREST can't
-- disambiguate overloads).

DROP FUNCTION IF EXISTS upsert_uniform_variant(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION upsert_uniform_variant(
    p_school_id      UUID,
    p_product_id     UUID,
    p_size           TEXT,
    p_price          NUMERIC,
    p_stock_quantity INTEGER DEFAULT NULL,
    p_is_active      BOOLEAN DEFAULT TRUE,
    p_user_id        UUID    DEFAULT NULL,
    p_user_email     TEXT    DEFAULT NULL,
    p_variant_id     UUID    DEFAULT NULL,
    p_cost_price     NUMERIC DEFAULT NULL,
    p_reorder_level  INTEGER DEFAULT NULL
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
    v_size   TEXT := TRIM(COALESCE(p_size, ''));
    v_exist  RECORD;
    v_cost   NUMERIC(12,2);
BEGIN
    IF v_size = '' OR length(v_size) > 20 THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Size label is required (max 20 characters). Examples: M, XL, 28, 32.');
    END IF;
    IF p_price IS NULL OR p_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Price is required.');
    END IF;
    IF p_cost_price IS NOT NULL AND p_cost_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Purchase price cannot be negative.');
    END IF;

    SELECT id, school_id, name, base_price, cost_price INTO v_prod
      FROM uniform_products
     WHERE id = p_product_id AND school_id = p_school_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found.');
    END IF;
    v_cost := COALESCE(p_cost_price, v_prod.cost_price);

    IF p_variant_id IS NOT NULL THEN
        SELECT v.id, v.stock_quantity, v.size
          INTO v_exist
          FROM uniform_variants v
          JOIN uniform_products p ON p.id = v.product_id
         WHERE v.id = p_variant_id AND p.id = p_product_id AND p.school_id = p_school_id
         FOR UPDATE OF v;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Size row not found.');
        END IF;
        IF EXISTS (SELECT 1 FROM uniform_variants
                    WHERE product_id = p_product_id AND color = 'Standard'
                      AND size = v_size AND id IS DISTINCT FROM p_variant_id) THEN
            RETURN jsonb_build_object('success', false,
                'error', 'Another size already uses the label "' || v_size || '".');
        END IF;
        UPDATE uniform_variants
           SET size          = v_size,
               price         = round(p_price, 2),
               cost_price    = COALESCE(p_cost_price, cost_price),
               reorder_level = COALESCE(p_reorder_level, reorder_level),
               is_active     = COALESCE(p_is_active, true),
               updated_at    = NOW()
         WHERE id = p_variant_id;
        v_id := p_variant_id;
        IF p_stock_quantity IS NOT NULL THEN
            PERFORM adjust_uniform_stock(p_school_id, v_id, GREATEST(0, p_stock_quantity),
                                         'Catalogue stock update', p_user_id, p_user_email);
        END IF;
    ELSE
        SELECT id, stock_quantity INTO v_id, v_prev
          FROM uniform_variants
         WHERE product_id = p_product_id AND size = v_size AND color = 'Standard'
         LIMIT 1;
        IF v_id IS NULL THEN
            v_stock := GREATEST(0, COALESCE(p_stock_quantity, 0));
            INSERT INTO uniform_variants (product_id, size, color, price, cost_price, stock_quantity, reorder_level, is_active)
            VALUES (p_product_id, v_size, 'Standard', round(p_price, 2), v_cost, v_stock,
                    GREATEST(0, COALESCE(p_reorder_level, 0)), COALESCE(p_is_active, true))
            RETURNING id INTO v_id;
            IF v_stock > 0 THEN
                INSERT INTO stock_adjustments (
                    variant_id, adjustment_type, quantity, previous_quantity, new_quantity, reason, adjusted_by, unit_cost
                ) VALUES (v_id, 'purchase', v_stock, 0, v_stock, 'Opening stock', p_user_id, v_cost);
            END IF;
        ELSE
            UPDATE uniform_variants
               SET price         = round(p_price, 2),
                   cost_price    = COALESCE(p_cost_price, cost_price),
                   reorder_level = COALESCE(p_reorder_level, reorder_level),
                   is_active     = COALESCE(p_is_active, true),
                   updated_at    = NOW()
             WHERE id = v_id;
            IF p_stock_quantity IS NOT NULL THEN
                PERFORM adjust_uniform_stock(p_school_id, v_id, GREATEST(0, p_stock_quantity),
                                             'Catalogue stock update', p_user_id, p_user_email);
            END IF;
        END IF;
    END IF;

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

GRANT EXECUTE ON FUNCTION upsert_uniform_variant(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN, UUID, TEXT, UUID, NUMERIC, INTEGER)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION upsert_uniform_variant IS
    'Create/update a uniform size: free-text label, selling price, purchase price, reorder level. Stock only via receive/adjust.';
