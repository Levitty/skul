-- Uniform Inventory & Sales System Migration
-- Creates tables for uniform products, variants, stock management, and sales

-- ============================================================================
-- 1. UNIFORM PRODUCTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS uniform_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'uniform' CHECK (category IN ('uniform', 'accessory', 'sportswear', 'other')),
    base_price NUMERIC(12, 2) NOT NULL,
    cost_price NUMERIC(12, 2),
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_uniform_products_school ON uniform_products(school_id);
CREATE INDEX IF NOT EXISTS idx_uniform_products_branch ON uniform_products(branch_id);
CREATE INDEX IF NOT EXISTS idx_uniform_products_active ON uniform_products(is_active);

-- ============================================================================
-- 2. PRODUCT VARIANTS (Size + Color)
-- ============================================================================
CREATE TABLE IF NOT EXISTS uniform_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES uniform_products(id) ON DELETE CASCADE,
    size TEXT NOT NULL CHECK (size IN ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL')),
    color TEXT NOT NULL,
    sku TEXT,
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    reorder_level INTEGER DEFAULT 10,
    price NUMERIC(12, 2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, size, color)
);

CREATE INDEX IF NOT EXISTS idx_uniform_variants_product ON uniform_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_uniform_variants_stock ON uniform_variants(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_uniform_variants_active ON uniform_variants(is_active);

-- ============================================================================
-- 3. STOCK ADJUSTMENTS (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variant_id UUID NOT NULL REFERENCES uniform_variants(id) ON DELETE CASCADE,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('purchase', 'sale', 'return', 'damaged', 'adjustment')),
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    adjusted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_variant ON stock_adjustments(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_date ON stock_adjustments(created_at);

-- ============================================================================
-- 4. UNIFORM SALES
-- ============================================================================
CREATE TABLE IF NOT EXISTS uniform_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES school_branches(id) ON DELETE SET NULL,
    sale_number TEXT NOT NULL,
    student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount NUMERIC(12, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'mpesa', 'paystack', 'cheque', 'other')),
    transaction_ref TEXT,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sold_by UUID REFERENCES auth.users(id),
    other_income_id UUID REFERENCES other_income(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, sale_number)
);

CREATE INDEX IF NOT EXISTS idx_uniform_sales_school ON uniform_sales(school_id);
CREATE INDEX IF NOT EXISTS idx_uniform_sales_branch ON uniform_sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_uniform_sales_student ON uniform_sales(student_id);
CREATE INDEX IF NOT EXISTS idx_uniform_sales_date ON uniform_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_uniform_sales_number ON uniform_sales(sale_number);

-- ============================================================================
-- 5. SALE ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS uniform_sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES uniform_sales(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES uniform_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON uniform_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON uniform_sale_items(variant_id);

-- ============================================================================
-- 6. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to generate sale number
CREATE OR REPLACE FUNCTION generate_sale_number(p_school_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_date TEXT;
    v_sequence INTEGER;
    v_sale_number TEXT;
BEGIN
    -- Get school code or use first 4 chars of school_id
    SELECT COALESCE(
        (SELECT code FROM schools WHERE id = p_school_id),
        UPPER(SUBSTRING(p_school_id::TEXT, 1, 4))
    ) INTO v_prefix;
    
    -- Format: SALE-YYYYMMDD-XXXX
    v_date := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    
    -- Get next sequence for today
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM uniform_sales
    WHERE school_id = p_school_id
      AND sale_number LIKE 'SALE-' || v_date || '-%';
    
    v_sale_number := 'SALE-' || v_date || '-' || LPAD(v_sequence::TEXT, 4, '0');
    
    RETURN v_sale_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update stock on sale
CREATE OR REPLACE FUNCTION update_stock_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_variant_id UUID;
    v_quantity INTEGER;
    v_previous_qty INTEGER;
    v_new_qty INTEGER;
BEGIN
    -- Get variant and quantity from sale item
    v_variant_id := NEW.variant_id;
    v_quantity := NEW.quantity;
    
    -- Get current stock
    SELECT stock_quantity INTO v_previous_qty
    FROM uniform_variants
    WHERE id = v_variant_id;
    
    -- Calculate new quantity
    v_new_qty := v_previous_qty - v_quantity;
    
    -- Update stock
    UPDATE uniform_variants
    SET stock_quantity = v_new_qty,
        updated_at = NOW()
    WHERE id = v_variant_id;
    
    -- Record adjustment
    INSERT INTO stock_adjustments (
        variant_id, adjustment_type, quantity,
        previous_quantity, new_quantity, reason
    ) VALUES (
        v_variant_id, 'sale', -v_quantity,
        v_previous_qty, v_new_qty,
        'Sale: ' || (SELECT sale_number FROM uniform_sales WHERE id = NEW.sale_id)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update stock when sale item is created
DROP TRIGGER IF EXISTS trigger_update_stock_on_sale ON uniform_sale_items;
CREATE TRIGGER trigger_update_stock_on_sale
    AFTER INSERT ON uniform_sale_items
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_on_sale();

-- Function to create other_income entry on sale
CREATE OR REPLACE FUNCTION create_other_income_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_income_id UUID;
    v_account_id UUID;
BEGIN
    -- Get Uniform Sales Revenue account (4600)
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE school_id = NEW.school_id
      AND account_code = '4600'
    LIMIT 1;
    
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

-- Trigger to create other_income when sale is created
DROP TRIGGER IF EXISTS trigger_create_other_income_on_sale ON uniform_sales;
CREATE TRIGGER trigger_create_other_income_on_sale
    AFTER INSERT ON uniform_sales
    FOR EACH ROW
    EXECUTE FUNCTION create_other_income_on_sale();

-- Function to restore stock on sale cancellation
CREATE OR REPLACE FUNCTION restore_stock_on_sale_cancel()
RETURNS TRIGGER AS $$
DECLARE
    v_item RECORD;
    v_previous_qty INTEGER;
    v_new_qty INTEGER;
BEGIN
    -- Restore stock for each sale item
    FOR v_item IN 
        SELECT variant_id, quantity
        FROM uniform_sale_items
        WHERE sale_id = OLD.id
    LOOP
        -- Get current stock
        SELECT stock_quantity INTO v_previous_qty
        FROM uniform_variants
        WHERE id = v_item.variant_id;
        
        -- Calculate new quantity
        v_new_qty := v_previous_qty + v_item.quantity;
        
        -- Update stock
        UPDATE uniform_variants
        SET stock_quantity = v_new_qty,
            updated_at = NOW()
        WHERE id = v_item.variant_id;
        
        -- Record adjustment
        INSERT INTO stock_adjustments (
            variant_id, adjustment_type, quantity,
            previous_quantity, new_quantity, reason
        ) VALUES (
            v_item.variant_id, 'return', v_item.quantity,
            v_previous_qty, v_new_qty,
            'Sale Cancelled: ' || OLD.sale_number
        );
    END LOOP;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to restore stock when sale is deleted (cancelled)
DROP TRIGGER IF EXISTS trigger_restore_stock_on_sale_cancel ON uniform_sales;
CREATE TRIGGER trigger_restore_stock_on_sale_cancel
    BEFORE DELETE ON uniform_sales
    FOR EACH ROW
    EXECUTE FUNCTION restore_stock_on_sale_cancel();

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE uniform_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniform_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniform_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniform_sale_items ENABLE ROW LEVEL SECURITY;

-- Uniform Products Policies
CREATE POLICY "Users can view products in their school"
    ON uniform_products FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY "Store keepers and admins can manage products"
    ON uniform_products FOR ALL
    USING (school_id = get_user_school_id());

-- Uniform Variants Policies
CREATE POLICY "Users can view variants in their school"
    ON uniform_variants FOR SELECT
    USING (
        product_id IN (
            SELECT id FROM uniform_products 
            WHERE school_id = get_user_school_id()
        )
    );

CREATE POLICY "Store keepers and admins can manage variants"
    ON uniform_variants FOR ALL
    USING (
        product_id IN (
            SELECT id FROM uniform_products 
            WHERE school_id = get_user_school_id()
        )
    );

-- Stock Adjustments Policies
CREATE POLICY "Users can view adjustments in their school"
    ON stock_adjustments FOR SELECT
    USING (
        variant_id IN (
            SELECT id FROM uniform_variants
            WHERE product_id IN (
                SELECT id FROM uniform_products 
                WHERE school_id = get_user_school_id()
            )
        )
    );

CREATE POLICY "Store keepers and admins can create adjustments"
    ON stock_adjustments FOR INSERT
    WITH CHECK (
        variant_id IN (
            SELECT id FROM uniform_variants
            WHERE product_id IN (
                SELECT id FROM uniform_products 
                WHERE school_id = get_user_school_id()
            )
        )
    );

-- Uniform Sales Policies
CREATE POLICY "Users can view sales in their school"
    ON uniform_sales FOR SELECT
    USING (school_id = get_user_school_id());

CREATE POLICY "Store keepers and admins can create sales"
    ON uniform_sales FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

CREATE POLICY "Store keepers and admins can update sales"
    ON uniform_sales FOR UPDATE
    USING (school_id = get_user_school_id());

CREATE POLICY "Store keepers and admins can delete sales"
    ON uniform_sales FOR DELETE
    USING (school_id = get_user_school_id());

-- Sale Items Policies
CREATE POLICY "Users can view sale items in their school"
    ON uniform_sale_items FOR SELECT
    USING (
        sale_id IN (
            SELECT id FROM uniform_sales 
            WHERE school_id = get_user_school_id()
        )
    );

CREATE POLICY "Store keepers and admins can manage sale items"
    ON uniform_sale_items FOR ALL
    USING (
        sale_id IN (
            SELECT id FROM uniform_sales 
            WHERE school_id = get_user_school_id()
        )
    );

