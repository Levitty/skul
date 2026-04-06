"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getBudgetVariance } from "@/lib/actions/budgets"
import { useState, useEffect } from "react"

interface BudgetsClientProps {
  budgets: any[]
}

export function BudgetsClient({ budgets }: BudgetsClientProps) {
  const [variances, setVariances] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Load variances for all budgets
    budgets.forEach(async (budget: any) => {
      if (!variances[budget.id]) {
        setLoading((prev) => ({ ...prev, [budget.id]: true }))
        try {
          const variance = await getBudgetVariance(budget.id)
          setVariances((prev) => ({ ...prev, [budget.id]: variance }))
        } catch (error) {
          console.error("Failed to load variance:", error)
        } finally {
          setLoading((prev) => ({ ...prev, [budget.id]: false }))
        }
      }
    })
  }, [budgets])

  if (budgets.length === 0) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No budgets created yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle>Active Budgets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {budgets.map((budget: any) => {
            const variance = variances[budget.id]
            const isLoading = loading[budget.id]
            const budgetAmount = Number(budget.budgeted_amount)
            const actualAmount = variance?.actualAmount || 0
            const varianceAmount = variance?.variance || 0
            const variancePercent = variance?.variancePercent || 0
            const isRevenue = budget.budget_type === "revenue"
            const isFavorable = isRevenue ? varianceAmount > 0 : varianceAmount < 0

            return (
              <div key={budget.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{budget.budget_name}</h3>
                      <Badge variant={isRevenue ? "outline" : "outline"} className={isRevenue ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"}>
                        {budget.budget_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(budget.period_start).toLocaleDateString()} - {new Date(budget.period_end).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Budgeted</p>
                    <p className="font-semibold">KES {budgetAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Actual</p>
                    <p className="font-semibold">
                      {isLoading ? "Loading..." : `KES ${actualAmount.toLocaleString()}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Variance</p>
                    <p className={`font-semibold ${isFavorable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {isLoading ? "..." : `${isFavorable ? "+" : ""}KES ${Math.abs(varianceAmount).toLocaleString()}`}
                    </p>
                  </div>
                </div>

                {!isLoading && (
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isFavorable
                          ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                          : "bg-gradient-to-r from-red-500 to-rose-600"
                      }`}
                      style={{
                        width: `${Math.min(Math.abs((actualAmount / budgetAmount) * 100), 100)}%`,
                      }}
                    />
                  </div>
                )}

                {variance && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {Math.abs(variancePercent).toFixed(1)}% {isFavorable ? "over" : "under"} budget
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}



