/**
 * Unit-Based Profitability calculations
 * Calculate P&L for specific segments (classes, departments, etc.)
 */

export interface UnitProfitability {
  unitType: "class" | "grade" | "department" | "transport" | "kitchen" | "hostel"
  unitId: string | null
  periodStart: Date
  periodEnd: Date
  revenue: number
  costs: number
  profit: number
  profitMargin: number
}

/**
 * Calculate profitability for a specific unit
 */
export function calculateUnitProfitability(
  revenue: number,
  costs: number
): Omit<UnitProfitability, "unitType" | "unitId" | "periodStart" | "periodEnd"> {
  const profit = revenue - costs
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0

  return {
    revenue,
    costs,
    profit,
    profitMargin,
  }
}

/**
 * Calculate revenue for a class/grade
 */
export async function calculateClassRevenue(
  supabase: any,
  schoolId: string,
  classId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  // Get all students in this class
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("class_id", classId)

  if (!enrollments || enrollments.length === 0) {
    return 0
  }

  const studentIds = enrollments.map((e: any) => e.student_id)

  // Get payments for these students in the period
  const { data: payments } = await supabase
    .from("payments")
    .select("amount")
    .eq("status", "completed")
    .gte("paid_at", periodStart.toISOString())
    .lte("paid_at", periodEnd.toISOString())
    .in(
      "invoice_id",
      supabase
        .from("invoices")
        .select("id")
        .in("student_id", studentIds)
        .eq("school_id", schoolId)
    )

  return (
    payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0
  )
}

/**
 * Calculate costs for a class/grade (simplified)
 */
export async function calculateClassCosts(
  supabase: any,
  schoolId: string,
  classId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  // Placeholder: would calculate from actual cost allocation
  // Could include teacher salaries, materials, etc.
  // For MVP, return 0 or estimate
  return 0
}

