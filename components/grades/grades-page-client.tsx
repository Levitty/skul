"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QuickActions } from "./quick-actions"
import { ExamsManager } from "./exams-manager"
import { ResultsEntry } from "./results-entry"
import { ReportsManager } from "./reports-manager"
import { GradesAnalysis } from "./grades-analysis"

interface GradesPageClientProps {
  exams: any[]
  sessions: any[]
  classes: Array<{ id: string; name: string }>
  academicYears: Array<{ id: string; name: string }>
  currentAcademicYearId?: string
  statistics: any
  topPerformers: any[]
  subjectPerformance: any[]
  overviewContent: React.ReactNode
}

export function GradesPageClient({
  exams,
  sessions,
  classes,
  academicYears,
  currentAcademicYearId,
  statistics,
  topPerformers,
  subjectPerformance,
  overviewContent,
}: GradesPageClientProps) {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full max-w-2xl grid-cols-5">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="exams">Exams</TabsTrigger>
        <TabsTrigger value="results">Enter Results</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        <QuickActions onNavigateToTab={setActiveTab} />
        {overviewContent}
      </TabsContent>

      <TabsContent value="exams" className="space-y-6">
        <ExamsManager
          initialExams={exams}
          initialSessions={sessions}
          academicYears={academicYears}
          classes={classes}
          currentAcademicYearId={currentAcademicYearId}
        />
      </TabsContent>

      <TabsContent value="results" className="space-y-6">
        <ResultsEntry
          initialSessions={sessions}
          classes={classes}
        />
      </TabsContent>

      <TabsContent value="reports" className="space-y-6">
        <ReportsManager
          classes={classes}
          academicYears={academicYears}
          currentAcademicYearId={currentAcademicYearId}
        />
      </TabsContent>

      <TabsContent value="analysis" className="space-y-6">
        <GradesAnalysis
          statistics={statistics}
          topPerformers={topPerformers}
          subjectPerformance={subjectPerformance}
        />
      </TabsContent>
    </Tabs>
  )
}
