/**
 * Comparison Tools for the Strategic Advisor
 * Term-over-term and year-over-year comparisons.
 */

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

// ============================================================================
// Tool: compare_terms
// ============================================================================
export async function compareTerms(
  userId: string,
  params: { metric: string; term1_id?: string; term2_id?: string }
) {
  const supabase = await createClient()
  const context = await requireTenantContext(userId)
  if (!context) return { error: "No school context" }

  // Get the two most recent terms if not specified
  const { data: terms } = await supabase
    .from("terms")
    .select("id, name, start_date, end_date, academic_years(name)")
    .eq("school_id", context.schoolId)
    .order("start_date", { ascending: false })
    .limit(4)

  if (!terms || terms.length < 2) {
    return { error: "Need at least 2 terms to compare" }
  }

  const term1 = params.term1_id
    ? (terms as any[]).find((t) => t.id === params.term1_id)
    : (terms as any[])[0]
  const term2 = params.term2_id
    ? (terms as any[]).find((t) => t.id === params.term2_id)
    : (terms as any[])[1]

  if (!term1 || !term2) {
    return { error: "Could not find specified terms" }
  }

  const metric = params.metric.toLowerCase()

  if (metric === "collection" || metric === "revenue" || metric === "fees") {
    // Compare fee collection between terms
    const getTermCollection = async (termId: string) => {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, amount")
        .eq("school_id", context.schoolId)
        .eq("term_id", termId)

      const totalInvoiced = (invoices || []).reduce(
        (sum: number, inv: any) => sum + Number(inv.amount || 0),
        0
      )

      const invoiceIds = (invoices || []).map((inv: any) => inv.id)
      let totalCollected = 0
      if (invoiceIds.length > 0) {
        const { data: payments } = await supabase
          .from("payments")
          .select("amount")
          .eq("status", "completed")
          .in("invoice_id", invoiceIds)

        totalCollected = (payments || []).reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0
        )
      }

      return {
        invoiced_kes: totalInvoiced,
        collected_kes: totalCollected,
        collection_rate:
          totalInvoiced > 0
            ? Math.round((totalCollected / totalInvoiced) * 1000) / 10
            : 0,
        invoice_count: (invoices || []).length,
      }
    }

    const term1Data = await getTermCollection(term1.id)
    const term2Data = await getTermCollection(term2.id)

    const revenueChange =
      term2Data.collected_kes > 0
        ? Math.round(
            ((term1Data.collected_kes - term2Data.collected_kes) /
              term2Data.collected_kes) *
              100
          )
        : null

    return {
      metric: "fee_collection",
      current_term: {
        name: `${term1.name} (${term1.academic_years?.name || ""})`,
        ...term1Data,
      },
      previous_term: {
        name: `${term2.name} (${term2.academic_years?.name || ""})`,
        ...term2Data,
      },
      change_percent: revenueChange,
      collection_rate_change:
        Math.round((term1Data.collection_rate - term2Data.collection_rate) * 10) / 10,
    }
  }

  if (metric === "enrollment" || metric === "students") {
    const getTermEnrollment = async (termId: string) => {
      // Get academic year for this term
      const { data: term } = await supabase
        .from("terms")
        .select("academic_year_id")
        .eq("id", termId)
        .single()

      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("academic_year_id", (term as any)?.academic_year_id)

      return { enrolled: count || 0 }
    }

    const term1Data = await getTermEnrollment(term1.id)
    const term2Data = await getTermEnrollment(term2.id)

    const change =
      term2Data.enrolled > 0
        ? Math.round(
            ((term1Data.enrolled - term2Data.enrolled) / term2Data.enrolled) *
              100
          )
        : null

    return {
      metric: "enrollment",
      current_term: {
        name: `${term1.name} (${term1.academic_years?.name || ""})`,
        ...term1Data,
      },
      previous_term: {
        name: `${term2.name} (${term2.academic_years?.name || ""})`,
        ...term2Data,
      },
      change_percent: change,
      absolute_change: term1Data.enrolled - term2Data.enrolled,
    }
  }

  return {
    error: `Unknown metric "${params.metric}". Available: collection, revenue, fees, enrollment, students`,
  }
}
