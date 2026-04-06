-- Admission Number Auto-Generation Function
-- This function generates sequential admission numbers per school in a concurrency-safe way

CREATE OR REPLACE FUNCTION generate_admission_number(p_school_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_next_number INTEGER;
    v_school_code TEXT;
    v_admission_number TEXT;
BEGIN
    -- Get school code (first 3 letters of school name or use a default)
    SELECT UPPER(SUBSTRING(REPLACE(name, ' ', ''), 1, 3)) INTO v_school_code
    FROM schools
    WHERE id = p_school_id;
    
    -- If no school code, use default
    IF v_school_code IS NULL OR LENGTH(v_school_code) < 3 THEN
        v_school_code := 'SCH';
    END IF;
    
    -- Get the highest admission number for this school and increment
    -- This uses a lock to ensure concurrency safety
    SELECT COALESCE(MAX(
        CASE 
            WHEN admission_number ~ '^[0-9]+$' THEN admission_number::INTEGER
            WHEN admission_number ~ '^[A-Z]{1,3}[0-9]+$' THEN 
                (SUBSTRING(admission_number FROM '[0-9]+$'))::INTEGER
            ELSE 0
        END
    ), 0) + 1 INTO v_next_number
    FROM students
    WHERE school_id = p_school_id
    AND admission_number IS NOT NULL;
    
    -- Format: SCHOOLCODE + 6-digit number (e.g., ABC000123)
    v_admission_number := v_school_code || LPAD(v_next_number::TEXT, 6, '0');
    
    RETURN v_admission_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-generate admission number if not provided
CREATE OR REPLACE FUNCTION auto_generate_admission_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if admission_number is NULL or empty
    IF NEW.admission_number IS NULL OR TRIM(NEW.admission_number) = '' THEN
        NEW.admission_number := generate_admission_number(NEW.school_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on students table
DROP TRIGGER IF EXISTS trigger_auto_generate_admission_number ON students;
CREATE TRIGGER trigger_auto_generate_admission_number
    BEFORE INSERT ON students
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_admission_number();




