"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  MessageSquare,
  X,
  Send,
  Database,
  ArrowRight,
  RefreshCw,
  Bot,
  User
} from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  source?: string
}

const suggestedQuestions = [
  "Can we afford a new bus?",
  "Who are my top performers?",
  "Show fee collection trends",
  "Analyze staff workload",
  "Predict next month's revenue",
]

export function IntelligenceBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const responses: Record<string, string> = {
        "Can we afford a new bus?": "Based on your current financial runway of 6.2 months and available reserves of KES 2.4M, purchasing a bus (estimated KES 3.5M) would reduce your runway to approximately 3.8 months. Recommendation: Consider a lease arrangement or phased payment plan.",
        "Who are my top performers?": "Top performing teachers this term:\n1. Mrs. Wanjiku (Math) - 94% student pass rate\n2. Mr. Ochieng (Science) - 91% pass rate\n3. Ms. Akinyi (English) - 89% pass rate\n\nThese teachers also have the highest student engagement scores.",
        "Show fee collection trends": "Fee collection analysis:\n• This month: KES 4.2M (78% of target)\n• vs Last month: +12% improvement\n• vs Same month last year: +8%\n\nTop defaulters by grade: Grade 6 (23 students)",
        "Analyze staff workload": "Staff workload analysis:\n• Average classes per teacher: 18/week\n• Highest workload: Mr. Kamau (26 classes)\n• Lowest workload: Ms. Njeri (12 classes)\n\n3 teachers show signs of burnout based on engagement metrics.",
        "Predict next month's revenue": "Revenue projection for next month:\n• Expected: KES 5.8M\n• Best case: KES 6.4M\n• Conservative: KES 5.1M\n\nFactors: Historical patterns, pending admissions, fee arrears recovery rate.",
      }

      const response = responses[content] || 
        "I understand your question. Based on our live database analysis, I'm processing the relevant data. For complex queries, I recommend reviewing the detailed analytics dashboard for comprehensive insights."

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date(),
        source: "Live Database",
      }

      setMessages(prev => [...prev, assistantMessage])
      setIsLoading(false)
    }, 1500)
  }

  return (
    <>
      {/* Floating Bot Bubble */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 w-14 h-14 rounded-full bg-neutral-900 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40",
          isOpen && "hidden"
        )}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
      >
        <MessageSquare className="w-6 h-6 text-white" />

        {/* Notification dot */}
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full" />
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 w-96 max-h-[600px] bg-white border border-neutral-200 rounded-lg shadow-lg flex flex-col z-50"
          >
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Management Intelligence</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-neutral-500">Online</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[400px]">
              {messages.length === 0 ? (
                <div className="space-y-4">
                  {/* Welcome message */}
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-neutral-100 flex items-center justify-center">
                      <Bot className="w-8 h-8 text-neutral-600" />
                    </div>
                    <h4 className="font-semibold text-sm">How can I help you today?</h4>
                    <p className="text-xs text-neutral-500 mt-1">
                      Ask me anything about your school&apos;s data
                    </p>
                  </div>

                  {/* Suggested Questions */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-neutral-500 px-1">Suggested questions</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedQuestions.map((question, i) => (
                        <motion.button
                          key={question}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          onClick={() => handleSendMessage(question)}
                          className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors"
                        >
                          {question}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message, i) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex gap-3",
                        message.role === "user" && "flex-row-reverse"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                        message.role === "user"
                          ? "bg-neutral-900 text-white"
                          : "bg-neutral-100 text-neutral-600"
                      )}>
                        {message.role === "user" ? (
                          <User className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                      </div>
                      <div className={cn(
                        "flex-1 space-y-1",
                        message.role === "user" && "text-right"
                      )}>
                        <div className={cn(
                          "inline-block p-3 rounded-lg text-sm max-w-[85%]",
                          message.role === "user"
                            ? "bg-neutral-900 text-white rounded-tr-none"
                            : "bg-neutral-100 rounded-tl-none"
                        )}>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                        {message.source && message.role === "assistant" && (
                          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                            <Database className="w-3 h-3" />
                            <span>Source: {message.source}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <RefreshCw className="w-4 h-4 text-neutral-600 animate-spin" />
                      </div>
                      <div className="bg-neutral-100 rounded-lg rounded-tl-none p-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-neutral-200">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendMessage(inputValue)
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask about your school data..."
                  className="flex-1 h-10 px-3 rounded-md border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className={cn(
                    "p-2 rounded-md transition-all duration-200",
                    inputValue.trim()
                      ? "bg-neutral-900 text-white hover:bg-neutral-800"
                      : "bg-neutral-100 text-neutral-400"
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {/* Source Badge */}
              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-neutral-500">
                <Database className="w-3 h-3" />
                <span>All responses from live database</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}


