"use client"

import { useState } from "react"
import { StudentDetailTabs } from "@/components/students/student-detail-tabs"

export default function StudentDetailPageClient({
  student,
  guardians,
  enrollments,
  invoices,
  payments,
  recentAttendance,
  documents,
}: {
  student: any
  guardians: any[]
  enrollments: any[]
  invoices: any[]
  payments: any[]
  recentAttendance: any[]
  documents: any[]
}) {
  return (
    <StudentDetailTabs
      student={student}
      guardians={guardians}
      enrollments={enrollments}
      invoices={invoices}
      payments={payments}
      recentAttendance={recentAttendance}
      documents={documents}
    />
  )
}




