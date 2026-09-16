-- ─────────────────────────────────────────────────────────────────
-- Migration 123: fold stray uniform colours into the size label
-- ─────────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor. After: Settings → API → Reload Schema Cache.
--
-- WHY
-- The uniform pages read only size rows whose colour is 'Standard'
-- (migration 114 made that the default and backfilled blanks). One legacy
-- row survived with colour 'Blue' — Springs Junior's 50 school shirts —
-- and was invisible on the Stock tab, the till and transfers. Colour is
-- not a dimension the UI offers, so it belongs in the label, not a column.
--
-- WHAT
-- Any row with a colour other than 'Standard' gets the colour appended to
-- its size label ("S" → "S Blue") unless that label already exists for the
-- product, then the colour is set to 'Standard'. Reported so you can see
-- what moved.
--
-- Idempotent: nothing to fold on a second run.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
    r RECORD;
    v_label TEXT;
    v_n INT := 0;
BEGIN
    FOR r IN
        SELECT v.id, v.product_id, v.size, v.color, p.name AS product_name
          FROM uniform_variants v
          JOIN uniform_products p ON p.id = v.product_id
         WHERE COALESCE(NULLIF(TRIM(v.color), ''), 'Standard') <> 'Standard'
    LOOP
        v_label := TRIM(r.size) || ' ' || TRIM(r.color);
        IF length(v_label) > 20 THEN v_label := left(v_label, 20); END IF;
        -- If that label is already taken on this product, keep the original
        -- size and just normalise the colour; the till will show both rows.
        IF EXISTS (SELECT 1 FROM uniform_variants
                    WHERE product_id = r.product_id AND size = v_label AND id <> r.id) THEN
            v_label := r.size;
        END IF;
        UPDATE uniform_variants
           SET size = v_label, color = 'Standard', updated_at = NOW()
         WHERE id = r.id;
        v_n := v_n + 1;
        RAISE NOTICE 'Folded % (%) → "%"', r.product_name, r.color, v_label;
    END LOOP;
    RAISE NOTICE 'Rows folded: %', v_n;
END $$;
