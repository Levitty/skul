/**
 * @deprecated — This file is no longer used by the Strategic Advisor.
 * The advisor now uses structured tool-use (see lib/agents/tools/) instead
 * of generating SQL. Kept for reference during migration; safe to delete
 * once the migration is fully tested.
 *
 * Database schema information for SQL generation (legacy)
 */

export const SCHEMA_INFO = `
# Tuta School Management System - Database Schema

## Core Tables

### schools
- id: UUID (Primary Key)
- name: TEXT (School name)
- address: TEXT
- phone: TEXT
- email: TEXT
- logo_url: TEXT
- created_at: TIMESTAMPTZ

### students
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- first_name: TEXT
- last_name: TEXT
- middle_name: TEXT
- dob: DATE
- gender: TEXT ('male', 'female', 'other')
- admission_number: TEXT (Unique per school)
- roll_number: TEXT
- status: TEXT ('active', 'inactive', 'suspended', 'graduated', 'transferred')
- created_at: TIMESTAMPTZ

### guardians
- id: UUID (Primary Key)
- student_id: UUID (Foreign Key -> students)
- name: TEXT
- relation: TEXT
- phone: TEXT
- email: TEXT
- is_primary: BOOLEAN
- is_billing_contact: BOOLEAN

### classes
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- name: TEXT
- level: INTEGER (Grade/Year level)
- capacity: INTEGER

### sections
- id: UUID (Primary Key)
- class_id: UUID (Foreign Key -> classes)
- name: TEXT (e.g., 'A', 'B')

### enrollments
- id: UUID (Primary Key)
- student_id: UUID (Foreign Key -> students)
- class_id: UUID (Foreign Key -> classes)
- section_id: UUID (Foreign Key -> sections)
- academic_year_id: UUID (Foreign Key -> academic_years)
- status: TEXT ('active', 'completed', 'withdrawn')

### academic_years
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- name: TEXT (e.g., '2024-2025')
- start_date: DATE
- end_date: DATE
- is_current: BOOLEAN

### terms
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- academic_year_id: UUID (Foreign Key -> academic_years)
- name: TEXT (e.g., 'Term 1', 'Term 2')
- start_date: DATE
- end_date: DATE
- due_date: DATE (Fee due date)
- is_current: BOOLEAN

## Financial Tables

### fee_structures
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- class_id: UUID (Foreign Key -> classes, nullable for all classes)
- term_id: UUID (Foreign Key -> terms, nullable for all terms)
- name: TEXT
- fee_type: TEXT ('tuition', 'transport', 'boarding', 'activity', 'other')
- amount: DECIMAL
- is_required: BOOLEAN
- is_active: BOOLEAN

### invoices
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- student_id: UUID (Foreign Key -> students)
- term_id: UUID (Foreign Key -> terms)
- invoice_number: TEXT
- amount: DECIMAL (Total invoice amount)
- status: TEXT ('unpaid', 'partial', 'paid', 'overdue')
- due_date: DATE
- created_at: TIMESTAMPTZ

### payments
- id: UUID (Primary Key)
- invoice_id: UUID (Foreign Key -> invoices)
- amount: DECIMAL
- method: TEXT ('cash', 'mpesa', 'bank_transfer', 'card')
- transaction_ref: TEXT
- status: TEXT ('pending', 'completed', 'failed')
- recorded_by: UUID (Foreign Key -> auth.users)
- created_at: TIMESTAMPTZ

## Academic Tables

### subjects
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- name: TEXT
- code: TEXT
- is_active: BOOLEAN

### exam_results
- id: UUID (Primary Key)
- student_id: UUID (Foreign Key -> students)
- subject_id: UUID (Foreign Key -> subjects)
- term_id: UUID (Foreign Key -> terms)
- marks: DECIMAL
- grade: TEXT
- created_at: TIMESTAMPTZ

### attendance_records
- id: UUID (Primary Key)
- student_id: UUID (Foreign Key -> students)
- class_id: UUID (Foreign Key -> classes)
- date: DATE
- status: TEXT ('present', 'absent', 'late', 'excused')
- recorded_by: UUID (Foreign Key -> auth.users)

## HR Tables

### employees
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- user_id: UUID (Foreign Key -> auth.users)
- first_name: TEXT
- last_name: TEXT
- role: TEXT ('teacher', 'admin', 'accountant', etc.)
- department: TEXT
- salary: DECIMAL
- status: TEXT ('active', 'inactive', 'terminated')
- hire_date: DATE

## Admissions

### applications
- id: UUID (Primary Key)
- school_id: UUID (Foreign Key -> schools)
- first_name: TEXT
- last_name: TEXT
- dob: DATE
- applied_class_id: UUID (Foreign Key -> classes)
- status: TEXT ('pending', 'reviewed', 'interviewed', 'accepted', 'rejected', 'waitlisted')
- created_at: TIMESTAMPTZ

## Key Relationships
- Students belong to a school
- Enrollments link students to classes and academic years
- Invoices are generated per student per term
- Payments are recorded against invoices
- Attendance is recorded per student per day
- Exam results are per student per subject per term
`

export const SQL_GENERATION_SYSTEM_PROMPT = `
You are a SQL query generator for the Tuta School Management System.
Your role is to generate READ-ONLY PostgreSQL queries based on user questions.

CRITICAL RULES:
1. Only generate SELECT queries - NEVER generate INSERT, UPDATE, DELETE, or DROP
2. Always filter by school_id using the provided school_id parameter
3. Use proper table aliases for readability
4. Always use COALESCE for nullable numeric fields to avoid NULL arithmetic
5. Use appropriate aggregate functions (SUM, COUNT, AVG)
6. Include proper GROUP BY for aggregations
7. Use CTEs (WITH clauses) for complex queries
8. Return the query in a JSON object with key "sql"

${SCHEMA_INFO}

Example queries:

Q: "How many active students do we have?"
A: {"sql": "SELECT COUNT(*) as total_students FROM students WHERE school_id = $1 AND status = 'active'"}

Q: "What is our total revenue this term?"
A: {"sql": "WITH current_term AS (SELECT id FROM terms WHERE school_id = $1 AND is_current = true LIMIT 1) SELECT COALESCE(SUM(p.amount), 0) as total_revenue FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE i.school_id = $1 AND i.term_id = (SELECT id FROM current_term) AND p.status = 'completed'"}

Q: "What is our fee collection rate?"
A: {"sql": "WITH invoice_totals AS (SELECT COALESCE(SUM(amount), 0) as total_invoiced FROM invoices WHERE school_id = $1 AND term_id IN (SELECT id FROM terms WHERE school_id = $1 AND is_current = true)), payment_totals AS (SELECT COALESCE(SUM(p.amount), 0) as total_collected FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE i.school_id = $1 AND i.term_id IN (SELECT id FROM terms WHERE school_id = $1 AND is_current = true) AND p.status = 'completed') SELECT total_invoiced, total_collected, CASE WHEN total_invoiced > 0 THEN ROUND((total_collected / total_invoiced) * 100, 2) ELSE 0 END as collection_rate FROM invoice_totals, payment_totals"}
`

export const INTENT_CLASSIFICATION_PROMPT = `
You are an intent classifier for a school management system.
Classify the user's question into one of these categories:

CATEGORIES:
- SUMMARY: General overview questions about school health
- FINANCIAL: Revenue, fees, payments, collection rates
- ACADEMIC: Grades, exam results, performance
- ATTENDANCE: Student attendance patterns
- ADMISSIONS: Application status, enrollment trends
- HR: Staff, teachers, salaries
- CAPACITY: Class sizes, facilities
- COMPARISON: Term-over-term or year-over-year comparisons
- FORECAST: Predictions and projections
- SCENARIO: What-if analysis questions

Return a JSON object with:
{
  "intent": "CATEGORY",
  "entities": ["extracted entities"],
  "time_period": "if mentioned",
  "requires_comparison": boolean,
  "requires_calculation": boolean
}
`



