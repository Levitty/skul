-- Migration 115: Custom uniform size labels (numbers, free text — not only XS–XL)
-- Run after 114. Reload schema cache when done.

-- ── 1. Drop letter-only size check ───────────────────────────────

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'uniform_variants'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%size%'
    LOOP
        EXECUTE format('ALTER TABLE uniform_variants DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

-- Soft guard: non-empty, short label (letters, numbers, spaces, hyphens, /)
ALTER TABLE uniform_variants
    ADD CONSTRAINT uniform_variants_size_label_check
    CHECK (
        length(trim(size)) >= 1
        AND length(trim(size)) <= 20
    );

-- ── 2. upsert_uniform_variant — any size label; optional rename by id ─

DROP FUNCTION IF EXISTS upsert_uniform_variant(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN, UUID, TEXT);
DROP FUNCTION IF EXISTS upsert_uniform_variant(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION upsert_uniform_variant(
    p_school_id      UUID,
    p_product_id     UUID,
    p_size           TEXT,
    p_price          NUMERIC,
    p_stock_quantity INTEGER DEFAULT NULL,
    p_is_active      BOOLEAN DEFAULT TRUE,
    p_user_id        UUID DEFAULT NULL,
    p_user_email     TEXT DEFAULT NULL,
    p_variant_id     UUID DEFAULT NULL
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
BEGIN
    IF v_size = '' OR length(v_size) > 20 THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Size label is required (max 20 characters). Examples: M, XL, 28, 32.');
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

    -- Update existing row by id (supports renaming size label e.g. M → 32)
    IF p_variant_id IS NOT NULL THEN
        SELECT v.id, v.stock_quantity, v.size
          INTO v_exist
          FROM uniform_variants v
          JOIN uniform_products p ON p.id = v.product_id
         WHERE v.id = p_variant_id
           AND p.id = p_product_id
           AND p.school_id = p_school_id
         FOR UPDATE OF v;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Size row not found.');
        END IF;

        -- Collision if renaming onto another size that already exists
        IF EXISTS (
            SELECT 1 FROM uniform_variants
             WHERE product_id = p_product_id
               AND color = 'Standard'
               AND size = v_size
               AND id IS DISTINCT FROM p_variant_id
        ) THEN
            RETURN jsonb_build_object('success', false,
                'error', 'Another size already uses the label "' || v_size || '".');
        END IF;

        UPDATE uniform_variants
           SET size = v_size,
               price = round(p_price, 2),
               is_active = COALESCE(p_is_active, true),
               updated_at = NOW()
         WHERE id = p_variant_id;

        v_id := p_variant_id;

        IF p_stock_quantity IS NOT NULL THEN
            PERFORM adjust_uniform_stock(
                p_school_id, v_id, GREATEST(0, p_stock_quantity),
                'Catalogue stock update', p_user_id, p_user_email
            );
        END IF;
    ELSE
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

GRANT EXECUTE ON FUNCTION upsert_uniform_variant(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN, UUID, TEXT, UUID)
    TO service_role, authenticated, anon;

COMMENT ON FUNCTION upsert_uniform_variant IS
    'Create/update a uniform size with free-text label (M, XL, 28, 32, …) and price/stock.';
