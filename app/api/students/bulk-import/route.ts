import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { NextResponse } from "next/server"

interface CSVRow {
  first_name: string
  last_name: string
  middle_name?: string
  gender?: string
  date_of_birth?: string
  admission_number?: string
  class_name?: string
  section_name?: string
  guardian_name?: string
  guardian_relation?: string
  guardian_phone?: string
  guardian_email?: string
  guardian_is_billing_contact?: string
  second_guardian_name?: string
  second_guardian_relation?: string
  second_guardian_phone?: string
  second_guardian_email?: string
}

interface ImportResult {
  row: number
  student_name: string
  status: "success" | "error"
  error?: string
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"))

  return lines.slice(1).map(line => {
    // Handle commas inside quoted fields
    const values: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === "," && !inQuotes) {
        values.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }
    values.push(current.trim())

    const row: any = {}
    headers.forEach((header, i) => {
      row[header] = values[i] || ""
    })
    return row as CSVRow
  })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return NextResponse.json({ error: "No school context" }, { status: 403 })
    }

    // Only school_admin and branch_admin can bulk import
    if (!["school_admin", "branch_admin", "super_admin"].includes(context.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV file is empty or has no data rows" }, { status: 400 })
    }

    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 students per import. Please split your file." }, { status: 400 })
    }

    // Validate required fields
    const invalidRows: string[] = []
    rows.forEach((row, i) => {
      if (!row.first_name || !row.last_name) {
        invalidRows.push(`Row ${i + 2}: Missing first_name or last_name`)
      }
    })

    if (invalidRows.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: invalidRows },
        { status: 400 }
      )
    }

    const adminClient = createServiceRoleClient() as any

    // Fetch classes and sections for this school to match names
    const { data: classes } = await adminClient
      .from("classes")
      .select("id, name")
      .eq("school_id", context.schoolId)

    const { data: sections } = await adminClient
      .from("sections")
      .select("id, name, class_id")
      .eq("school_id", context.schoolId)

    const classMap = new Map(
      ((classes as any[]) || []).map((c: any) => [c.name.toLowerCase().trim(), c.id])
    )
    const sectionMap = new Map(
      ((sections as any[]) || []).map((s: any) => [`${s.class_id}_${s.name.toLowerCase().trim()}`, s.id])
    )

    const results: ImportResult[] = []
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const studentName = `${row.first_name} ${row.last_name}`

      try {
        // Build student record
        const studentData: any = {
          school_id: context.schoolId,
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          status: "active",
        }

        if (row.middle_name) studentData.middle_name = row.middle_name.trim()
        if (row.gender) studentData.gender = row.gender.trim()
        if (row.date_of_birth) studentData.dob = row.date_of_birth.trim()
        if (row.admission_number) studentData.admission_number = row.admission_number.trim()

        // Add branch_id if the user is branch-scoped
        if (context.branchId) {
          studentData.branch_id = context.branchId
        }

        // Insert student
        const { data: student, error: studentError } = await adminClient
          .from("students")
          .insert(studentData)
          .select("id")
          .single()

        if (studentError) {
          throw new Error(studentError.message)
        }

        // Create enrollment if class was specified
        if (row.class_name) {
          const classId = classMap.get(row.class_name.toLowerCase().trim())
          if (classId) {
            const enrollmentData: any = {
              student_id: student.id,
              class_id: classId,
              school_id: context.schoolId,
              status: "active",
            }

            // Match section if provided
            if (row.section_name) {
              const sectionId = sectionMap.get(
                `${classId}_${row.section_name.toLowerCase().trim()}`
              )
              if (sectionId) {
                enrollmentData.section_id = sectionId
              }
            }

            await adminClient.from("enrollments").insert(enrollmentData)
          }
        }

        // Insert primary guardian if provided
        if (row.guardian_name) {
          const guardianData: any = {
            student_id: student.id,
            name: row.guardian_name.trim(),
            relation: row.guardian_relation?.trim() || "Guardian",
            is_primary: true,
            is_billing_contact:
              row.guardian_is_billing_contact?.toLowerCase() === "yes" ||
              row.guardian_is_billing_contact?.toLowerCase() === "true",
          }
          if (row.guardian_phone) guardianData.phone = row.guardian_phone.trim()
          if (row.guardian_email) guardianData.email = row.guardian_email.trim()

          await adminClient.from("guardians").insert(guardianData)
        }

        // Insert second guardian if provided
        if (row.second_guardian_name) {
          const guardian2Data: any = {
            student_id: student.id,
            name: row.second_guardian_name.trim(),
            relation: row.second_guardian_relation?.trim() || "Guardian",
            is_primary: false,
            is_billing_contact: false,
          }
          if (row.second_guardian_phone) guardian2Data.phone = row.second_guardian_phone.trim()
          if (row.second_guardian_email) guardian2Data.email = row.second_guardian_email.trim()

          await adminClient.from("guardians").insert(guardian2Data)
        }

        results.push({ row: i + 2, student_name: studentName, status: "success" })
        successCount++
      } catch (err: any) {
        results.push({
          row: i + 2,
          student_name: studentName,
          status: "error",
          error: err.message || "Unknown error",
        })
        errorCount++
      }
    }

    return NextResponse.json({
      message: `Import complete: ${successCount} succeeded, ${errorCount} failed`,
      total: rows.length,
      success_count: successCount,
      error_count: errorCount,
      results,
    })
  } catch (err: any) {
    console.error("Bulk import error:", err)
    return NextResponse.json(
      { error: "Import failed: " + (err.message || "Unknown error") },
      { status: 500 }
    )
  }
}
