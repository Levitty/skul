"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Users,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { ClassStudentSummary, StudentDetailedProgress } from "@/lib/actions/student-progress"

interface StudentProgressViewProps {
  students: ClassStudentSummary[]
  onStudentSelect: (studentId: string) => void
  selectedStudentId: string | null
  detailedProgress: StudentDetailedProgress | null
  isLoading: boolean
}

export function StudentProgressView({
  students,
  onStudentSelect,
  selectedStudentId,
  detailedProgress,
  isLoading,
}: StudentProgressViewProps) {
  const selectedStudent = students.find((s) => s.id === selectedStudentId)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Left Panel: Student List */}
      <div className="lg:col-span-1">
        <Card className="border border-neutral-200 shadow-sm h-full flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-neutral-900">Class Students</CardTitle>
            <CardDescription className="text-neutral-500">{students.length} students</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-4">
                {students.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No students found</p>
                ) : (
                  students.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => onStudentSelect(student.id)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 ${
                        selectedStudentId === student.id
                          ? "border-neutral-900 bg-neutral-100"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-neutral-900">{student.name}</div>
                          <div className="text-xs text-neutral-500">
                            #{student.admissionNumber}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${
                            student.averagePercentage >= 80
                              ? "text-emerald-600 dark:text-emerald-400"
                              : student.averagePercentage >= 60
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400"
                          }`}>
                            {student.averageGrade}%
                          </div>
                          <Badge
                            variant="outline"
                            className="text-xs mt-1"
                          >
                            Rank #{student.rankInClass}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="text-xs text-neutral-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {student.attendanceRate}%
                        </div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {student.homeworkCompletionRate}%
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel: Detail View */}
      <div className="lg:col-span-2">
        {!selectedStudentId ? (
          <Card className="border border-neutral-200 shadow-sm h-full flex items-center justify-center">
            <div className="text-center">
              <Users className="w-12 h-12 mx-auto text-neutral-500 mb-4 opacity-50" />
              <p className="text-neutral-500">Select a student to view their progress</p>
            </div>
          </Card>
        ) : isLoading ? (
          <Card className="border border-neutral-200 shadow-sm h-full flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 mb-4" />
              <p className="text-neutral-500">Loading progress details...</p>
            </div>
          </Card>
        ) : detailedProgress ? (
          <div className="space-y-4 h-full overflow-y-auto">
            {/* Student Header */}
            <Card className="border border-neutral-200 shadow-sm bg-neutral-50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl text-neutral-900">{detailedProgress.student.name}</CardTitle>
                    <CardDescription className="text-neutral-500">
                      {detailedProgress.student.admissionNumber} • {detailedProgress.class.name}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-neutral-900">
                      {detailedProgress.overallSummary.averageGrade}
                    </div>
                    <div className="text-sm text-neutral-500">
                      {detailedProgress.overallSummary.averagePercentage}%
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Overall Performance Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border border-neutral-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardDescription className="text-neutral-600">Overall Grade</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-neutral-900">
                    {detailedProgress.overallSummary.averageGrade}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {detailedProgress.overallSummary.averagePercentage}% average
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-neutral-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardDescription className="text-neutral-600">Class Rank</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-neutral-900">
                    #{detailedProgress.overallSummary.rankInClass}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    of {detailedProgress.overallSummary.totalStudentsInClass} students
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-neutral-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardDescription className="text-neutral-600">Attendance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-neutral-900">
                    {detailedProgress.attendance.attendanceRate}%
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {detailedProgress.attendance.presentDays}/{detailedProgress.attendance.totalDays} days
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-neutral-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardDescription className="text-neutral-600">Homework Completion</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-neutral-900">
                    {detailedProgress.homework.completionRate}%
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {detailedProgress.homework.completedCount}/{detailedProgress.homework.totalCount}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Strengths and Areas for Support */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border border-neutral-200 shadow-sm border-l-4 border-l-emerald-500">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-neutral-900">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {detailedProgress.strengths.map((strength, idx) => (
                      <li key={idx} className="text-sm flex items-start gap-2 text-neutral-700">
                        <span className="text-emerald-600 mt-0.5">•</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border border-neutral-200 shadow-sm border-l-4 border-l-amber-500">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-neutral-900">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    Areas Needing Support
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {detailedProgress.areasNeedingSupport.map((area, idx) => (
                      <li key={idx} className="text-sm flex items-start gap-2 text-neutral-700">
                        <span className="text-amber-600 mt-0.5">!</span>
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Subject Breakdown */}
            <Card className="border border-neutral-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-neutral-900">Subject Breakdown</CardTitle>
                <CardDescription className="text-neutral-500">Performance by subject with exam details</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={detailedProgress.subjectBreakdown[0]?.subject || ""} className="w-full">
                  <TabsList className="grid w-full gap-2" style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(100px, 1fr))`
                  }}>
                    {detailedProgress.subjectBreakdown.map((subject) => (
                      <TabsTrigger
                        key={subject.subject}
                        value={subject.subject}
                        className="text-xs"
                      >
                        {subject.subject}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {detailedProgress.subjectBreakdown.map((subject) => (
                    <TabsContent key={subject.subject} value={subject.subject} className="space-y-4 mt-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <Card className="border border-neutral-200">
                          <CardHeader className="pb-3">
                            <CardDescription className="text-neutral-600">Average Grade</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold text-neutral-900">
                              {subject.grade}
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">
                              {subject.averagePercentage}%
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border border-neutral-200">
                          <CardHeader className="pb-3">
                            <CardDescription className="text-neutral-600">Exams Taken</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold text-neutral-900">{subject.examsCount}</div>
                          </CardContent>
                        </Card>

                        <Card className="border border-neutral-200">
                          <CardHeader className="pb-3">
                            <CardDescription className="text-neutral-600">Progress</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-neutral-900">
                              {subject.averagePercentage >= 80 ? "Good" : subject.averagePercentage >= 60 ? "Fair" : "Needs Support"}
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Exam Details */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-neutral-900">Exam Performance</h4>
                        {subject.exams.map((exam, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="font-medium text-sm text-neutral-900">{exam.examName}</div>
                                <div className="text-xs text-neutral-500">
                                  {exam.examType} • {new Date(exam.examDate).toLocaleDateString()}
                                </div>
                              </div>
                              <Badge variant="outline" className={`${
                                exam.percentage >= 80
                                  ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                                  : exam.percentage >= 60
                                  ? "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                                  : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
                              }`}>
                                {exam.grade}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-neutral-500">
                                {exam.marksObtained}/{exam.maxMarks} marks
                              </span>
                              <span className="font-medium text-neutral-900">{Math.round(exam.percentage)}%</span>
                            </div>
                            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden mt-2">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  exam.percentage >= 80
                                    ? "bg-emerald-500"
                                    : exam.percentage >= 60
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${Math.min(exam.percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            {/* Attendance & Completion Details */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border border-neutral-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-neutral-900">Attendance Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-neutral-900">Attendance Rate</span>
                      <span className="text-sm font-bold text-neutral-900">
                        {detailedProgress.attendance.attendanceRate}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-neutral-900 transition-all"
                        style={{ width: `${detailedProgress.attendance.attendanceRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-2 rounded-lg bg-green-50">
                      <div className="text-neutral-600 text-xs">Present</div>
                      <div className="font-bold text-lg text-neutral-900">{detailedProgress.attendance.presentDays}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-red-50">
                      <div className="text-neutral-600 text-xs">Absent</div>
                      <div className="font-bold text-lg text-neutral-900">{detailedProgress.attendance.absentDays}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-neutral-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-neutral-900">Homework & Assignments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-neutral-900">Homework Completion</span>
                      <span className="text-sm font-bold text-neutral-900">
                        {detailedProgress.homework.completionRate}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-neutral-900 transition-all"
                        style={{ width: `${detailedProgress.homework.completionRate}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-neutral-900">Assignment Completion</span>
                      <span className="text-sm font-bold text-neutral-900">
                        {detailedProgress.assignments.completionRate}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-neutral-900 transition-all"
                        style={{ width: `${detailedProgress.assignments.completionRate}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs text-neutral-500">
                    <div>
                      {detailedProgress.homework.completedCount}/{detailedProgress.homework.totalCount} homework
                    </div>
                    <div>
                      {detailedProgress.assignments.completedCount}/{detailedProgress.assignments.totalCount} assignments
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="border border-neutral-200 shadow-sm h-full flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4 opacity-50" />
              <p className="text-neutral-500">Failed to load student progress</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
