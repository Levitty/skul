/**
 * Invisible Auditor
 * Cross-references data to flag anomalies and potential issues
 */

export interface AuditAnomaly {
  anomalyType:
    | "inventory_usage"
    | "fuel_consumption"
    | "attendance_mismatch"
    | "payment_discrepancy"
  description: string
  severity: "low" | "medium" | "high" | "critical"
  referenceData: Record<string, any>
}

/**
 * Check for inventory usage anomalies
 * Compares inventory consumption against actual attendance
 */
export async function checkInventoryAnomalies(
  supabase: any,
  schoolId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = []

  // Get average daily attendance
  const { data: attendanceRecords } = await supabase
    .from("attendance_records")
    .select("date, student_id")
    .eq("school_id", schoolId)
    .eq("status", "present")
    .gte("date", periodStart.toISOString().split("T")[0])
    .lte("date", periodEnd.toISOString().split("T")[0])

  if (!attendanceRecords) {
    return anomalies
  }

  // Calculate average daily attendance
  const dailyAttendance: Record<string, number> = {}
  attendanceRecords.forEach((record: any) => {
    const date = record.date
    if (!dailyAttendance[date]) {
      dailyAttendance[date] = 0
    }
    dailyAttendance[date]++
  })

  const avgDailyAttendance =
    Object.values(dailyAttendance).reduce((a: number, b: number) => a + b, 0) /
    Object.keys(dailyAttendance).length

  // Placeholder: Would compare against inventory usage records
  // For example, if food consumption > enrolled students * days
  // This would require an inventory_usage table

  return anomalies
}

/**
 * Check for fuel consumption anomalies
 * Compares fuel usage against bus routes and trips
 */
export async function checkFuelAnomalies(
  supabase: any,
  schoolId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = []

  // Placeholder: Would check fuel consumption records
  // against actual bus routes and student transport assignments
  // This would require transport and fuel tracking tables

  return anomalies
}

/**
 * Check for attendance mismatches
 * Flags cases where attendance doesn't match enrollment
 */
export async function checkAttendanceMismatches(
  supabase: any,
  schoolId: string,
  date: Date
): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = []

  // Get enrolled students
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("school_id", schoolId)

  if (!enrollments) {
    return anomalies
  }

  const enrolledCount = enrollments.length

  // Get attendance for the date
  const { data: attendance } = await supabase
    .from("attendance_records")
    .select("student_id")
    .eq("school_id", schoolId)
    .eq("date", date.toISOString().split("T")[0])
    .eq("status", "present")

  const presentCount = attendance?.length || 0

  // Flag if attendance is significantly higher than enrollment
  // (could indicate data entry error or fraud)
  if (presentCount > enrolledCount * 1.1) {
    anomalies.push({
      anomalyType: "attendance_mismatch",
      description: `Attendance (${presentCount}) exceeds enrollment (${enrolledCount}) by more than 10%`,
      severity: "high",
      referenceData: {
        enrolledCount,
        presentCount,
        date: date.toISOString(),
      },
    })
  }

  return anomalies
}

/**
 * Check for payment discrepancies
 * Flags unmatched payments or unusual patterns
 */
export async function checkPaymentDiscrepancies(
  supabase: any,
  schoolId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = []

  // Get payments that haven't been reconciled
  const { data: unreconciled } = await supabase
    .from("payment_reconciliations")
    .select("payment_id, payments(*)")
    .eq("school_id", schoolId)
    .eq("status", "unmatched")
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString())

  if (unreconciled && unreconciled.length > 0) {
    anomalies.push({
      anomalyType: "payment_discrepancy",
      description: `${unreconciled.length} payments remain unreconciled`,
      severity: "medium",
      referenceData: {
        count: unreconciled.length,
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
      },
    })
  }

  return anomalies
}

