"use client"

import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react"

interface Insight {
  type: "success" | "warning" | "danger" | "info"
  title: string
  value: string
  trend?: "up" | "down" | "stable"
  comparison?: string
}

interface InsightBadgeProps {
  insight: Insight
}

export function InsightBadge({ insight }: InsightBadgeProps) {
  const getTypeStyles = () => {
    switch (insight.type) {
      case "success":
        return "bg-green-50 border-green-200 text-green-800"
      case "warning":
        return "bg-amber-50 border-amber-200 text-amber-800"
      case "danger":
        return "bg-red-50 border-red-200 text-red-800"
      case "info":
      default:
        return "bg-blue-50 border-blue-200 text-blue-800"
    }
  }

  const getIcon = () => {
    switch (insight.type) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-600" />
      case "danger":
        return <XCircle className="w-5 h-5 text-red-600" />
      case "info":
      default:
        return <Info className="w-5 h-5 text-blue-600" />
    }
  }

  const getTrendIcon = () => {
    switch (insight.trend) {
      case "up":
        return <TrendingUp className="w-4 h-4" />
      case "down":
        return <TrendingDown className="w-4 h-4" />
      case "stable":
      default:
        return <Minus className="w-4 h-4" />
    }
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${getTypeStyles()}`}>
      {getIcon()}
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{insight.title}</span>
          {insight.trend && (
            <span
              className={`flex items-center gap-1 text-xs ${
                insight.trend === "up"
                  ? "text-green-600"
                  : insight.trend === "down"
                  ? "text-red-600"
                  : "text-gray-500"
              }`}
            >
              {getTrendIcon()}
            </span>
          )}
        </div>
        <p className="text-lg font-bold mt-1">{insight.value}</p>
        {insight.comparison && (
          <p className="text-xs mt-1 opacity-75">{insight.comparison}</p>
        )}
      </div>
    </div>
  )
}



