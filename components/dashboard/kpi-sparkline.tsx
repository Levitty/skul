"use client"

import { motion } from "framer-motion"
import { useMemo } from "react"

interface SparklineData {
  date: string
  amount: number
}

interface KPISparklineProps {
  data: SparklineData[]
  height?: number
  color?: "emerald" | "amber" | "rose" | "indigo"
  showDots?: boolean
}

export function KPISparkline({
  data,
  height = 60,
  color = "emerald",
  showDots = true,
}: KPISparklineProps) {
  const colors = {
    emerald: {
      stroke: "#10b981",
      fill: "url(#emerald-gradient)",
      dot: "#10b981",
    },
    amber: {
      stroke: "#f59e0b",
      fill: "url(#amber-gradient)",
      dot: "#f59e0b",
    },
    rose: {
      stroke: "#f43f5e",
      fill: "url(#rose-gradient)",
      dot: "#f43f5e",
    },
    indigo: {
      stroke: "#6366f1",
      fill: "url(#indigo-gradient)",
      dot: "#6366f1",
    },
  }

  const { path, areaPath, points, viewBox } = useMemo(() => {
    if (data.length === 0) {
      return { path: "", areaPath: "", points: [], viewBox: "0 0 100 60" }
    }

    const padding = 10
    const width = 200
    const chartHeight = height - padding * 2

    const amounts = data.map((d) => d.amount)
    const maxAmount = Math.max(...amounts, 1)
    const minAmount = Math.min(...amounts, 0)
    const range = maxAmount - minAmount || 1

    const pointsArray = data.map((d, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2)
      const y = padding + (1 - (d.amount - minAmount) / range) * chartHeight
      return { x, y, data: d }
    })

    const linePath = pointsArray
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ")

    const areaPathStr = `
      ${linePath}
      L ${pointsArray[pointsArray.length - 1]?.x || width - padding} ${height - padding}
      L ${padding} ${height - padding}
      Z
    `

    return {
      path: linePath,
      areaPath: areaPathStr,
      points: pointsArray,
      viewBox: `0 0 ${width} ${height}`,
    }
  }, [data, height])

  if (data.length === 0) {
    return (
      <div 
        className="w-full flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  return (
    <svg 
      className="w-full overflow-visible" 
      viewBox={viewBox} 
      preserveAspectRatio="none"
      style={{ height }}
    >
      <defs>
        <linearGradient id="emerald-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="amber-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rose-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="indigo-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      <motion.path
        d={areaPath}
        fill={colors[color].fill}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
      
      {/* Line */}
      <motion.path
        d={path}
        fill="none"
        stroke={colors[color].stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      
      {/* Dots */}
      {showDots && points.map((point, i) => (
        <motion.circle
          key={i}
          cx={point.x}
          cy={point.y}
          r="3"
          fill={colors[color].dot}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 + i * 0.05, duration: 0.2 }}
        />
      ))}
    </svg>
  )
}


