// TypeScript types for database tables
// This file provides type safety for database operations

export type StudentStatus = "active" | "graduated" | "exited" | "transferred"
export type ApplicationStatus = "pending" | "reviewed" | "interviewed" | "accepted" | "rejected" | "waitlisted"
export type AttendanceStatus = "present" | "absent" | "late" | "excused"
export type PaymentMethod = "cash" | "bank_transfer" | "paystack" | "mpesa" | "cheque" | "other"
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded"
export type InvoiceStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled"
export type ExamType = "midterm" | "final" | "continuous_assessment" | "quiz" | "assignment"
export type UserRole = "super_admin" | "school_admin" | "teacher" | "parent" | "student" | "accountant" | "librarian" | "nurse" | "transport_manager" | "hostel_manager" | "store_keeper"
export type DeploymentMode = "shared" | "isolated"

export interface School {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  is_active: boolean
  deployment_mode: DeploymentMode
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  school_id: string
  first_name: string
  last_name: string
  middle_name: string | null
  dob: string | null
  gender: string | null
  admission_number: string | null
  status: StudentStatus
  photo_url: string | null
  created_at: string
  updated_at: string
}

export interface Guardian {
  id: string
  student_id: string
  name: string
  relation: string
  phone: string | null
  email: string | null
  is_primary: boolean
  is_billing_contact: boolean
  created_at: string
  updated_at: string
}

export interface Application {
  id: string
  school_id: string
  first_name: string
  last_name: string
  dob: string | null
  gender: string | null
  guardian_name: string
  guardian_phone: string
  guardian_email: string | null
  applied_class_id: string | null
  status: ApplicationStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  school_id: string
  student_id: string
  academic_year_id: string
  reference: string
  amount: number
  status: InvoiceStatus
  due_date: string | null
  issued_date: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  invoice_id: string
  amount: number
  method: PaymentMethod
  transaction_ref: string | null
  gateway_response: Record<string, any> | null
  status: PaymentStatus
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceRecord {
  id: string
  school_id: string
  student_id: string
  date: string
  period_id: string | null
  status: AttendanceStatus
  note: string | null
  recorded_by: string | null
  created_at: string
}

