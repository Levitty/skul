/**
 * Type helpers for Supabase Database types
 * These utilities make it easier to work with Supabase types
 */

import { Database } from "@/types/database"

/**
 * Get the Row type for a table
 * 
 * @example
 * type Student = Tables<'students'>
 */
export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']

/**
 * Get the Insert type for a table
 * 
 * @example
 * type NewStudent = Inserts<'students'>
 */
export type Inserts<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Insert']

/**
 * Get the Update type for a table
 * 
 * @example
 * type StudentUpdate = Updates<'students'>
 */
export type Updates<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Update']

/**
 * Get the Row type for a view
 */
export type Views<T extends keyof Database['public']['Views']> = 
  Database['public']['Views'][T]['Row']

/**
 * Helper to extract nested types from joined queries
 * 
 * @example
 * type StudentWithEnrollments = Tables<'students'> & {
 *   enrollments: Tables<'enrollments'>[]
 * }
 */
export type WithRelations<
  T extends keyof Database['public']['Tables'],
  Relations extends Record<string, any>
> = Tables<T> & Relations

/**
 * Common type aliases for frequently used tables
 */
export type Student = Tables<'students'>
export type Guardian = any // Tables<'guardians'> - table may not exist in generated types
export type Application = Tables<'admissions'>
export type Invoice = any // Tables<'invoices'> - table may not exist in generated types
export type Payment = any // Tables<'payments'> - table may not exist in generated types
export type Enrollment = any // Tables<'enrollments'> - table may not exist in generated types
export type Class = Tables<'classes'>
export type Section = any // Tables<'sections'> - table may not exist in generated types
// Note: These tables may not exist in the generated types yet
// Using any for now until migrations are applied
export type AcademicYear = any // Tables<'academic_years'>
export type Term = any // Tables<'terms'>
export type FeeStructure = any // Tables<'fee_structures'>
export type CustomRole = any // Tables<'custom_roles'>
export type Permission = any // Tables<'permissions'>

/**
 * Type for student with enrollments
 */
export type StudentWithEnrollments = Student & {
  enrollments?: Array<Enrollment & {
    classes?: Class
    sections?: Section
    academic_years?: AcademicYear
  }>
}

/**
 * Type for invoice with payments
 */
export type InvoiceWithPayments = Invoice & {
  payments?: Payment[]
  students?: Student
}

/**
 * Type for application with class info
 */
export type ApplicationWithClass = Application & {
  classes?: Class
}

