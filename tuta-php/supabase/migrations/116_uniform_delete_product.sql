-- Migration 116: Delete unused uniform items/sizes; archive if they have sales/transfers.

CREATE OR REPLACE FUNCTION delete_uniform_product(
    p_school_id  UUID,
    p_product_id UUID,
    p_user_id    UUID DEFAULT NULL,
    p_user_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_prod RECORD;
    v_used BOOLEAN := false;
BEGIN
    SELECT * INTO v_prod
      FROM uniform_products
     WHERE id = p_product_id AND school_id = p_school_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not found.');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM uniform_sale_items si
          JOIN uniform_variants v ON v.id = si.variant_id
         WHERE v.product_id = p_product_id
    ) OR EXISTS (
        SELECT 1
          FROM stock_transfer_items ti
          JOIN uniform_variants v ON v.id = ti.from_variant_id OR v.id = ti.to_variant_id
         WHERE v.product_id = p_product_id
    ) INTO v_used;

    IF v_used THEN
        UPDATE uniform_variants SET is_active = false, updated_at = NOW()
         WHERE product_id = p_product_id;
        UPDATE uniform_products SET is_active = false, updated_at = NOW()
         WHERE id = p_product_id;

        INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
        VALUES (p_school_id, p_user_id, p_user_email, 'archive', 'uniform_product', p_product_id,
                jsonb_build_object('name', v_prod.name, 'reason', 'has sales or transfers'));

        RETURN jsonb_build_object('success', true, 'archived', true,
            'message', 'This item has sales or transfers, so it was hidden instead of deleted.');
    END IF;

    DELETE FROM stock_adjustments
     WHERE variant_id IN (SELECT id FROM uniform_variants WHERE product_id = p_product_id);
    DELETE FROM uniform_variants WHERE product_id = p_product_id;
    DELETE FROM uniform_products WHERE id = p_product_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'delete', 'uniform_product', p_product_id,
            jsonb_build_object('name', v_prod.name));

    RETURN jsonb_build_object('success', true, 'archived', false, 'message', 'Item deleted.');
END;
$fn$;

GRANT EXECUTE ON FUNCTION delete_uniform_product(UUID, UUID, UUID, TEXT)
    TO service_role, authenticated, anon;

CREATE OR REPLACE FUNCTION delete_uniform_variant(
    p_school_id  UUID,
    p_variant_id UUID,
    p_user_id    UUID DEFAULT NULL,
    p_user_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_var RECORD;
    v_used BOOLEAN := false;
BEGIN
    SELECT v.*, p.school_id AS product_school_id, p.name AS product_name
      INTO v_var
      FROM uniform_variants v
      JOIN uniform_products p ON p.id = v.product_id
     WHERE v.id = p_variant_id AND p.school_id = p_school_id
       FOR UPDATE OF v;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Size not found.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM uniform_sale_items WHERE variant_id = p_variant_id
    ) OR EXISTS (
        SELECT 1 FROM stock_transfer_items
         WHERE from_variant_id = p_variant_id OR to_variant_id = p_variant_id
    ) INTO v_used;

    IF v_used THEN
        UPDATE uniform_variants SET is_active = false, updated_at = NOW() WHERE id = p_variant_id;
        RETURN jsonb_build_object('success', true, 'archived', true,
            'message', 'This size has sales or transfers, so it was hidden instead of deleted.');
    END IF;

    DELETE FROM stock_adjustments WHERE variant_id = p_variant_id;
    DELETE FROM uniform_variants WHERE id = p_variant_id;

    INSERT INTO audit_logs (school_id, user_id, user_email, action, entity_type, entity_id, payload)
    VALUES (p_school_id, p_user_id, p_user_email, 'delete', 'uniform_variant', p_variant_id,
            jsonb_build_object('product', v_var.product_name, 'size', v_var.size));

    RETURN jsonb_build_object('success', true, 'archived', false, 'message', 'Size deleted.');
END;
$fn$;

GRANT EXECUTE ON FUNCTION delete_uniform_variant(UUID, UUID, UUID, TEXT)
    TO service_role, authenticated, anon;
