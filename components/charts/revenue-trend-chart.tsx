"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface RevenueTrendChartProps {
  data: Array<{
    date: string
    revenue: number
  }>
}

export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const chartData = data.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: item.revenue
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-800" />
        <XAxis 
          dataKey="date" 
          className="text-xs text-muted-foreground"
          tick={{ fill: 'currentColor' }}
        />
        <YAxis 
          className="text-xs text-muted-foreground"
          tick={{ fill: 'currentColor' }}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
            padding: '0.5rem'
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number) => `KES ${value.toLocaleString()}`}
        />
        <Bar 
          dataKey="revenue" 
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}




