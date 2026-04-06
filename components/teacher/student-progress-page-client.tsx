"use client"

import { useState, useCallback } from "react"
import { ClassStudentSummary, StudentDetailedProgress, getStudentDetailedProgress } from "@/lib/actions/student-progress"
import { StudentProgressView } from "./student-progress-view"

interface StudentProgressPageClientProps {
  classId: string
  className: string
  students: ClassStudentSummary[]
}

export function StudentProgressPageClient({
  classId,
  className,
  students,
}: StudentProgressPageClientProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [detailedProgress, setDetailedProgress] = useState<StudentDetailedProgress | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleStudentSelect = useCallback(
    async (studentId: string) => {
      setSelectedStudentId(studentId)
      setIsLoading(true)
      setDetailedProgress(null)

      try {
        const result = await getStudentDetailedProgress(studentId, classId)
        if (result.error) {
          console.error("Error loading student details:", result.error)
          setDetailedProgress(null)
        } else {
          setDetailedProgress(result.data)
        }
      } catch (error) {
        console.error("Error loading student details:", error)
        setDetailedProgress(null)
      } finally {
        setIsLoading(false)
      }
    },
    [classId]
  )

  return (
    <StudentProgressView
      students={students}
      onStudentSelect={handleStudentSelect}
      selectedStudentId={selectedStudentId}
      detailedProgress={detailedProgress}
      isLoading={isLoading}
    />
  )
}
