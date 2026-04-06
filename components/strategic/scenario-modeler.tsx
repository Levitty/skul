"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, Sparkles, Loader2 } from "lucide-react"
import { InsightBadge } from "./insight-badge"

interface ScenarioModelerProps {
  onClose: () => void
}

export function ScenarioModeler({ onClose }: ScenarioModelerProps) {
  const [scenarioType, setScenarioType] = useState<string>("fee_change")
  const [value, setValue] = useState<string>("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const scenarioTypes = [
    { value: "fee_change", label: "Fee Change", placeholder: "Enter amount (e.g., 500 for +500 KES)" },
    { value: "enrollment_change", label: "Enrollment Change", placeholder: "Enter number of students" },
    { value: "expense_change", label: "Expense Change", placeholder: "Enter amount" },
  ]

  const handleAnalyze = async () => {
    if (!value || !description) return

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch("/api/strategic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "scenario",
          scenario: {
            type: scenarioType,
            value: parseFloat(value),
            description,
          },
        }),
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        answer: "Failed to analyze scenario. Please try again.",
        insights: [],
        recommendation: "",
      })
    } finally {
      setLoading(false)
    }
  }

  const currentType = scenarioTypes.find((t) => t.value === scenarioType)

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              What-If Scenario Analysis
            </CardTitle>
            <CardDescription>
              Model the impact of potential changes on your school
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Scenario Type</Label>
            <Select value={scenarioType} onValueChange={setScenarioType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {scenarioTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={currentType?.placeholder}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Increase transport fee by 500 KES"
            />
          </div>
        </div>

        <Button onClick={handleAnalyze} disabled={loading || !value || !description}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze Impact
            </>
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="mt-6 p-4 bg-neutral-50 rounded-lg space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Analysis Result</h3>
              <p className="text-sm">{result.answer}</p>
            </div>

            {result.insights && result.insights.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Projected Impact</h4>
                {result.insights.map((insight: any, index: number) => (
                  <InsightBadge key={index} insight={insight} />
                ))}
              </div>
            )}

            {result.recommendation && (
              <div className="p-3 bg-primary/10 rounded-lg border-l-4 border-primary">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Recommendation</span>
                </div>
                <p className="text-sm">{result.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}



