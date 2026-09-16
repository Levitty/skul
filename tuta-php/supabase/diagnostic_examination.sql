-- ============================================================================
-- Examination module — schema diagnostic
-- READ-ONLY. This changes nothing. It just reports what exists.
-- Run it in the Supabase SQL editor and send Claude the result grid.
-- ============================================================================

SELECT
    'TABLE  ' || t AS item,
    CASE WHEN to_regclass('public.' || t) IS NOT NULL
         THEN 'exists'
         ELSE '>>> MISSING <<<'
    END AS status
FROM unnest(ARRAY[
        'schools', 'students', 'classes', 'academic_years', 'terms', 'subjects',
        'user_schools', 'exams', 'grades', 'report_cards', 'report_card_subjects'
     ]) AS t

UNION ALL

SELECT
    'exams column  ' || c,
    CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'exams'
              AND column_name  = c
         )
         THEN 'exists'
         ELSE '>>> MISSING <<<'
    END
FROM unnest(ARRAY[
        'academic_year_id', 'term_id', 'start_date', 'end_date', 'max_marks', 'status'
     ]) AS c

ORDER BY item;
