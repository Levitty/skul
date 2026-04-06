/**
 * Strategic Advisor — Claude API with Tool-Use
 *
 * This is the core reasoning engine. It replaces the old OpenAI + SQL-generation
 * approach with Claude's tool-use pattern:
 *
 *   1. User asks a question
 *   2. Claude receives the question + Kenyan school context + tool definitions
 *   3. Claude decides which tools to call (may call several in sequence)
 *   4. Each tool runs a real database query and returns verified numbers
 *   5. Claude cross-references the results and forms a strategic insight
 *
 * Key principle: the database owns facts, the AI owns "so what."
 */

import { getAnthropicClient } from "@/lib/integrations/anthropic"
import {
  KENYAN_SCHOOL_CONTEXT,
  ADVISOR_BASE_PERSONA,
} from "./prompts/domain-context"
import { TOOL_DEFINITIONS, executeTool } from "./tools/index"

// ============================================================================
// Types
// ============================================================================

export interface AdvisorQuery {
  question: string
  schoolId: string
  userId: string
  conversationHistory?: ConversationMessage[]
  /** "whatsapp" keeps responses short; "web" returns structured JSON */
  channel?: "whatsapp" | "web"
}

export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

export interface AdvisorResponse {
  answer: string
  insights: Insight[]
  recommendation: string
  data?: any
  toolsUsed?: string[]
  error?: string
}

export interface Insight {
  type: "success" | "warning" | "danger" | "info"
  title: string
  value: string
  trend?: "up" | "down" | "stable"
  comparison?: string
}

// ============================================================================
// Constants
// ============================================================================

const MAX_TOOL_ROUNDS = 8 // safety limit on agentic loops
const MODEL = "claude-sonnet-4-20250514"

// ============================================================================
// System Prompt Builder
// ============================================================================

function buildSystemPrompt(channel: "whatsapp" | "web"): string {
  const formatInstruction =
    channel === "web"
      ? `
You MUST respond with valid JSON matching this structure:
{
  "answer": "Direct answer with specific numbers from tools",
  "insights": [
    {
      "type": "success|warning|danger|info",
      "title": "Short insight title",
      "value": "The metric value",
      "trend": "up|down|stable",
      "comparison": "vs previous period if available"
    }
  ],
  "recommendation": "One specific, actionable recommendation"
}
`
      : `
Respond in plain text suitable for WhatsApp. Keep it under 300 words.
Lead with the answer, add 2-4 key data points, end with one recommendation.
Use KES for all monetary values with commas (e.g., KES 1,250,000).
`

  return `${ADVISOR_BASE_PERSONA}

${KENYAN_SCHOOL_CONTEXT}

${formatInstruction}

IMPORTANT RULES:
- Every number you cite MUST come from a tool result. If a tool returned an error, say so.
- You may call multiple tools to build a complete picture before answering.
- If you don't have data for part of the question, be transparent about the gap.
- Never fabricate KES figures, percentages, or student counts.`
}

// ============================================================================
// Error Sanitization
// ============================================================================

function sanitizeErrorForUser(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  console.error("[StrategicAdvisor] Internal error:", msg)

  if (msg.includes("ANTHROPIC") || msg.includes("API") || msg.includes("api")) {
    return "The AI service is temporarily unavailable. Please try again shortly."
  }
  if (msg.includes("relation") || msg.includes("column") || msg.includes("syntax")) {
    return "There was a problem querying school data. Please try a different question."
  }
  if (msg.includes("tenant") || msg.includes("school")) {
    return "Could not determine your school. Please contact support."
  }
  return "An unexpected error occurred. Please try again or contact support."
}

// ============================================================================
// Core: Process a Strategic Question
// ============================================================================

/**
 * The main entry point. Sends the user's question to Claude with tool
 * definitions, then enters an agentic loop where Claude can call tools
 * until it has enough data to formulate its answer.
 */
export async function processStrategicQuestion(
  query: AdvisorQuery
): Promise<AdvisorResponse> {
  const channel = query.channel || "web"

  try {
    const client = getAnthropicClient()
    const systemPrompt = buildSystemPrompt(channel)

    // Build the messages array with conversation history
    const messages: { role: "user" | "assistant"; content: string }[] = []

    // Inject prior conversation for follow-up context
    if (query.conversationHistory?.length) {
      for (const msg of query.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add the current question
    messages.push({ role: "user", content: query.question })

    // Track which tools were called for transparency
    const toolsUsed: string[] = []

    // --- Agentic tool-use loop ---
    let currentMessages: any[] = [...messages]
    let finalText = ""

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS as any,
        messages: currentMessages,
      })

      // Check if Claude wants to use tools
      if (response.stop_reason === "tool_use") {
        // Extract all tool_use blocks from the response
        const toolUseBlocks = response.content.filter(
          (block: any) => block.type === "tool_use"
        )

        // Execute each tool call
        const toolResults: any[] = []
        for (const toolBlock of toolUseBlocks) {
          const tb = toolBlock as any
          const toolName = tb.name
          const toolInput = tb.input || {}

          toolsUsed.push(toolName)
          console.log(`[StrategicAdvisor] Tool call: ${toolName}`, toolInput)

          let result: any
          try {
            result = await executeTool(toolName, toolInput, query.userId)
          } catch (toolErr: any) {
            console.error(`[StrategicAdvisor] Tool error (${toolName}):`, toolErr)
            result = {
              error: `Tool ${toolName} failed: ${toolErr.message}`,
            }
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: tb.id,
            content: JSON.stringify(result),
          })
        }

        // Feed the assistant's response and tool results back into the conversation
        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ]

        // Continue the loop — Claude may want to call more tools
        continue
      }

      // Claude is done reasoning — extract the final text
      for (const block of response.content) {
        if ((block as any).type === "text") {
          finalText += (block as any).text
        }
      }

      break // exit the loop
    }

    // --- Parse the response ---
    if (channel === "web") {
      return parseWebResponse(finalText, toolsUsed)
    } else {
      return {
        answer: finalText.trim(),
        insights: [],
        recommendation: "",
        toolsUsed,
      }
    }
  } catch (err: unknown) {
    return {
      answer: sanitizeErrorForUser(err),
      insights: [],
      recommendation: "Please try again or contact support.",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * For the web UI channel, we expect Claude to return JSON.
 * If it doesn't parse cleanly, we wrap the raw text as the answer.
 */
function parseWebResponse(text: string, toolsUsed: string[]): AdvisorResponse {
  try {
    // Try to extract JSON from the response (Claude sometimes wraps it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        answer: parsed.answer || text,
        insights: parsed.insights || [],
        recommendation: parsed.recommendation || "",
        toolsUsed,
      }
    }
  } catch {
    // JSON parse failed — fall through
  }

  // Fallback: treat the whole response as the answer
  return {
    answer: text.trim(),
    insights: [],
    recommendation: "",
    toolsUsed,
  }
}

// ============================================================================
// Scenario Analysis (What-If)
// ============================================================================

/**
 * Process a "what-if" scenario by giving Claude the scenario parameters
 * along with tool access to pull current baselines.
 */
export async function processScenario(
  scenario: {
    type: "fee_change" | "enrollment_change" | "expense_change"
    value: number
    description: string
  },
  query: AdvisorQuery
): Promise<AdvisorResponse> {
  // Wrap the scenario as a detailed question so the tool-use advisor handles it
  const scenarioQuestion = `
SCENARIO ANALYSIS REQUEST:
${scenario.description}
Change type: ${scenario.type}
Change value: ${scenario.value}

Pull the current baseline data using the appropriate tools, then calculate the projected impact of this change.
Show: current state → projected state → net impact.
Provide a strategic recommendation on whether this change is advisable.
`

  return processStrategicQuestion({
    ...query,
    question: scenarioQuestion,
  })
}
