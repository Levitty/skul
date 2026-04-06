-- Allow termly exam types (opening, midterm, endterm)
-- while keeping existing exam types.

ALTER TABLE exams
  DROP CONSTRAINT IF EXISTS exams_exam_type_check;

ALTER TABLE exams
  ADD CONSTRAINT exams_exam_type_check
  CHECK (exam_type IN (
    'opening',
    'midterm',
    'endterm',
    'final',
    'continuous_assessment',
    'quiz',
    'assignment'
  ));
