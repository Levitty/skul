/**
 * Helper functions for type-safe Supabase queries
 * These help TypeScript infer types correctly from Supabase queries
 */

import { Database } from "@/types/database"
import { SupabaseClient } from "@supabase/supabase-js"

/**
 * Safely extract data from a Supabase query result
 * Handles null/undefined and provides proper typing
 */
export function extractData<T>(
  result: { data: T | null; error: any }
): T | null {
  if (result.error) {
    console.error("Supabase query error:", result.error)
    return null
  }
  return result.data
}

/**
 * Safely extract data from a Supabase query result, throwing on error
 */
export function extractDataOrThrow<T>(
  result: { data: T | null; error: any },
  errorMessage?: string
): T {
  if (result.error) {
    throw new Error(errorMessage || result.error.message || "Query failed")
  }
  if (!result.data) {
    throw new Error(errorMessage || "No data returned")
  }
  return result.data
}

/**
 * Type helper for Supabase table queries
 */
export type SupabaseQueryResult<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']

/**
 * Type helper for Supabase query with relations
 */
export type SupabaseQueryWithRelations<
  T extends keyof Database['public']['Tables'],
  Relations extends Record<string, any> = {}
> = SupabaseQueryResult<T> & Relations



