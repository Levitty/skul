export const EXAM_TYPES = [
  "opening",
  "midterm",
  "endterm",
  "final",
  "continuous_assessment",
  "quiz",
  "assignment",
] as const

export type ExamType = (typeof EXAM_TYPES)[number]

export interface ClassExamReport {
  classInfo: { id: string; name: string; level?: number | null }
  examType?: ExamType
  sessions: Array<{
    id: string
    subject: string
    exam_date: string | null
    max_marks: number | null
    exams: { id: string; name: string; exam_type: ExamType }
    exam_results: Array<{
      student_id: string
      marks_obtained: number | null
      students: { id: string; first_name: string; last_name: string; admission_number?: string | null }
    }>
  }>
  students: Array<{
    id: string
    name: string
    admissionNumber?: string | null
    totalMarks: number
    maxMarks: number
    average: number
    examsTaken: number
  }>
}

export interface GradesStatistics {
  averageGrade: string
  averagePercentage: number
  topPerformersCount: number
  needSupportCount: number
  gradedExamsCount: number
  totalExamsCount: number
  gradeDistribution: {
    A: number
    B: number
    C: number
    D: number
    F: number
  }
}

export interface TopPerformer {
  id: string
  name: string
  class: string
  average: number
  grade: string
}

export interface SubjectPerformance {
  subject: string
  average: number
  totalStudents: number
}
