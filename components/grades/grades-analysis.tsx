"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts"

interface GradesAnalysisProps {
  statistics: any
  topPerformers: any[]
  subjectPerformance: any[]
}

const COLORS = {
  A: "#10b981", // emerald
  B: "#3b82f6", // blue
  C: "#8b5cf6", // purple
  D: "#f59e0b", // amber
  F: "#ef4444", // red
}

const gradeColors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"]

export function GradesAnalysis({ statistics, topPerformers, subjectPerformance }: GradesAnalysisProps) {
  const gradeDistributionData = statistics?.gradeDistribution ? [
    { name: "A (90-100%)", value: statistics.gradeDistribution.A, color: COLORS.A },
    { name: "B (80-89%)", value: statistics.gradeDistribution.B, color: COLORS.B },
    { name: "C (70-79%)", value: statistics.gradeDistribution.C, color: COLORS.C },
    { name: "D (60-69%)", value: statistics.gradeDistribution.D, color: COLORS.D },
    { name: "F (0-59%)", value: statistics.gradeDistribution.F, color: COLORS.F },
  ].filter(item => item.value > 0) : []

  const subjectData = (subjectPerformance || []).slice(0, 10).map(subj => ({
    subject: subj.subject,
    average: subj.average,
    students: subj.totalStudents,
  }))

  const topPerformersData = topPerformers.map((p, index) => ({
    name: p.name.split(" ")[0], // First name only for chart
    average: p.average,
    rank: index + 1,
  }))

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Overall Average</CardDescription>
            <CardTitle className="text-3xl">{statistics?.averagePercentage?.toFixed(1) || 0}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Students Graded</CardDescription>
            <CardTitle className="text-3xl">
              {statistics?.topPerformersCount + statistics?.needSupportCount || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pass Rate</CardDescription>
            <CardTitle className="text-3xl">
              {(() => {
                const dist = statistics?.gradeDistribution || { A: 0, B: 0, C: 0, D: 0, F: 0 }
                const total = dist.A + dist.B + dist.C + dist.D + dist.F
                const passed = dist.A + dist.B + dist.C + dist.D
                return total > 0 ? Math.round((passed / total) * 100) : 0
              })()}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Grade Distribution Chart */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Grade Distribution</CardTitle>
            <CardDescription>Distribution of grades across all exams</CardDescription>
          </CardHeader>
          <CardContent>
            {gradeDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={gradeDistributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {gradeDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No grade data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grade Distribution (Bar)</CardTitle>
            <CardDescription>Count of students by grade</CardDescription>
          </CardHeader>
          <CardContent>
            {gradeDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={gradeDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8">
                    {gradeDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No grade data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Subject Performance */}
      {subjectData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subject Performance</CardTitle>
            <CardDescription>Average scores by subject</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={subjectData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="subject" type="category" width={120} />
                <Tooltip />
                <Bar dataKey="average" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Performers Chart */}
      {topPerformersData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>Top 5 students by average score</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topPerformersData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="average" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
