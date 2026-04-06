"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface QuickActionsProps {
  onNavigateToTab: (tab: string) => void
}

export function QuickActions({ onNavigateToTab }: QuickActionsProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex gap-3 flex-wrap">
          <Button 
            onClick={() => onNavigateToTab("reports")}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
          >
            View All Reports
          </Button>
          <Button 
            onClick={() => onNavigateToTab("results")}
            variant="outline"
          >
            Enter New Results
          </Button>
          <Button 
            onClick={() => onNavigateToTab("exams")}
            variant="outline"
          >
            Create Exam
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
