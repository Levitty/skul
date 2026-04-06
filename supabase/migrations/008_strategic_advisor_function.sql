-- Strategic Advisor: Safe SQL Execution Function
-- This function executes read-only queries with school_id filtering

CREATE OR REPLACE FUNCTION execute_read_query(
    query_text TEXT,
    school_id_param UUID
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    safe_query TEXT;
BEGIN
    -- Validate query is SELECT only
    IF NOT (
        UPPER(TRIM(query_text)) LIKE 'SELECT%' OR 
        UPPER(TRIM(query_text)) LIKE 'WITH%'
    ) THEN
        RAISE EXCEPTION 'Only SELECT queries are allowed';
    END IF;
    
    -- Check for dangerous keywords
    IF UPPER(query_text) ~ '(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)' THEN
        RAISE EXCEPTION 'Query contains forbidden keywords';
    END IF;
    
    -- Replace $1 placeholder with actual school_id
    safe_query := REPLACE(query_text, '$1', quote_literal(school_id_param));
    
    -- Execute the query and return results as JSONB
    EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || safe_query || ') t'
    INTO result;
    
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION execute_read_query(TEXT, UUID) TO authenticated;

-- Revoke from public
REVOKE EXECUTE ON FUNCTION execute_read_query(TEXT, UUID) FROM public;



