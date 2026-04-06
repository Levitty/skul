"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Brain, 
  Send, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle,
  Users,
  DollarSign,
  BarChart3,
  Calendar,
  Loader2,
  Lightbulb
} from "lucide-react"
import { InsightBadge } from "./insight-badge"
import { ScenarioModeler } from "./scenario-modeler"

interface QuickStats {
  activeStudents: number
  monthlyRevenue: number
  pendingFees: number
  attendanceRate: number
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  insights?: any[]
  recommendation?: string
  timestamp: Date
}

interface StrategicAdvisorClientProps {
  quickStats: QuickStats
}

export function StrategicAdvisorClient({ quickStats }: StrategicAdvisorClientProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showScenario, setShowScenario] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const suggestedQuestions = [
    "How is my school doing this term?",
    "What is our fee collection rate?",
    "Which classes have the lowest attendance?",
    "What should I focus on next term?",
    "Can we afford to hire another teacher?",
  ]

  const handleSubmit = async (question: string) => {
    if (!question.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: question,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const response = await fetch("/api/strategic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer || data.error || "I couldn't generate a response.",
        insights: data.insights,
        recommendation: data.recommendation,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, there was an error processing your question. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3">
            <Brain className="w-10 h-10 text-primary" />
            Strategic Advisor
          </h1>
          <p className="text-lg text-neutral-500 mt-1">
            Your AI-powered Chief Operating Officer
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowScenario(!showScenario)}>
          <Sparkles className="w-4 h-4 mr-2" />
          What-If Analysis
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500">Active Students</p>
                <p className="text-2xl font-bold">{quickStats.activeStudents}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500">Monthly Revenue</p>
                <p className="text-2xl font-bold">KES {quickStats.monthlyRevenue.toLocaleString()}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500">Pending Fees</p>
                <p className="text-2xl font-bold">KES {quickStats.pendingFees.toLocaleString()}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500">Attendance Rate</p>
                <p className="text-2xl font-bold">{quickStats.attendanceRate}%</p>
              </div>
              <Calendar className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario Modeler */}
      {showScenario && (
        <ScenarioModeler onClose={() => setShowScenario(false)} />
      )}

      {/* Chat Interface */}
      <Card className="flex flex-col h-[600px]">
        <CardHeader>
          <CardTitle>Ask Your Strategic Advisor</CardTitle>
          <CardDescription>
            Ask questions about your school&apos;s performance, finances, or get strategic recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 bg-neutral-100/30 rounded-lg">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <Lightbulb className="w-12 h-12 mx-auto text-neutral-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Start a Conversation</h3>
                <p className="text-sm text-neutral-500 mb-4">
                  Ask me anything about your school&apos;s performance
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestedQuestions.map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSubmit(q)}
                      className="text-xs"
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-lg ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>

                    {/* Insights */}
                    {message.insights && message.insights.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {message.insights.map((insight, index) => (
                          <InsightBadge key={index} insight={insight} />
                        ))}
                      </div>
                    )}

                    {/* Recommendation */}
                    {message.recommendation && (
                      <div className="mt-4 p-3 bg-primary/10 rounded-lg border-l-4 border-primary">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-sm">Strategic Recommendation</span>
                        </div>
                        <p className="text-sm">{message.recommendation}</p>
                      </div>
                    )}

                    <p className="text-xs text-neutral-500 mt-2">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-background border p-4 rounded-lg flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing your data...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit(input)
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about revenue, attendance, performance..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

