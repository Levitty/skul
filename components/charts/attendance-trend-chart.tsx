"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface AttendanceTrendChartProps {
  data: Array<{
    date: string
    present: number
    total: number
  }>
}

export function AttendanceTrendChart({ data }: AttendanceTrendChartProps) {
  const chartData = data.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    rate: item.total > 0 ? Math.round((item.present / item.total) * 100) : 0
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-800" />
        <XAxis 
          dataKey="date" 
          className="text-xs text-muted-foreground"
          tick={{ fill: 'currentColor' }}
        />
        <YAxis 
          domain={[0, 100]}
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
        />
        <Line 
          type="monotone" 
          dataKey="rate" 
          stroke="hsl(var(--primary))" 
          strokeWidth={2}
          dot={{ fill: 'hsl(var(--primary))', r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}




