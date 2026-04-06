/**
 * Tool Registry for the Strategic Advisor
 *
 * Each tool definition follows Claude's tool_use format.
 * The dispatcher routes tool calls to the appropriate handler.
 * Every handler returns real data from the database — never estimates.
 */

import type Anthropic from "@anthropic-ai/sdk"
import {
  getFinancialRunway,
  getCollectionRate,
  getFeeArrears,
  getExpenseSummary,
  getFeeStructure,
} from "./financial-tools"
import {
  getStudentCount,
  getEnrollmentTrend,
  getAttendanceRate,
  getCapacityUtilization,
} from "./student-tools"
import {
  getTransportMetrics,
  getAdmissionsPipeline,
  getStaffOverview,
} from "./operational-tools"
import { compareTerms } from "./comparison-tools"
import {
  getReportCardSummary,
  getTeacherPerformanceMetrics,
} from "./academic-tools"

// ============================================================================
// Tool Definitions (Claude API format)
// ============================================================================
export const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: "get_financial_runway",
    description:
      "Get the school's financial runway: bank balance, average monthly expenses, average monthly income, net cash flow, and how many months the school can operate. Use this when asked about financial health, cash position, or sustainability.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_collection_rate",
    description:
      "Get the fee collection rate: total invoiced vs total collected, with breakdown by status (paid, partial, unpaid, overdue). Use this when asked about fee collection, revenue, or how much has been paid.",
    input_schema: {
      type: "object" as const,
      properties: {
        term_id: {
          type: "string",
          description:
            "Specific term ID. If omitted, uses the current term.",
        },
        class_id: {
          type: "string",
          description: "Filter by class ID. If omitted, shows all classes.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_fee_arrears",
    description:
      "Get outstanding fee arrears: who owes money, how much, and their payment status. Returns the top defaulters sorted by amount owed. Use when asked about unpaid fees, defaulters, or outstanding balances.",
    input_schema: {
      type: "object" as const,
      properties: {
        term_id: {
          type: "string",
          description: "Filter by term ID.",
        },
        class_id: {
          type: "string",
          description: "Filter by class ID.",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of defaulters to return. Default 20.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_expense_summary",
    description:
      "Get expense breakdown by category with totals. Use when asked about spending, costs, or where money is going.",
    input_schema: {
      type: "object" as const,
      properties: {
        months: {
          type: "number",
          description:
            "Number of months to look back. Default 3.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_fee_structure",
    description:
      "Get the current fee structure: what fees are charged, amounts, and whether they are required. Use when asked about fees, pricing, or fee changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        term_id: {
          type: "string",
          description: "Filter by term ID.",
        },
        class_id: {
          type: "string",
          description: "Filter by class ID.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_student_count",
    description:
      "Get student counts with breakdown by status and class. Use when asked about enrollment numbers, how many students, or student demographics.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description:
            "Filter by status: active, inactive, suspended, graduated, transferred. If omitted, returns all.",
        },
        class_id: {
          type: "string",
          description: "Filter by class ID.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_enrollment_trend",
    description:
      "Get enrollment numbers over multiple academic years to show growth or decline. Use when asked about enrollment trends, growth, or year-over-year comparison.",
    input_schema: {
      type: "object" as const,
      properties: {
        periods: {
          type: "number",
          description:
            "Number of academic years to include. Default 4.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_attendance_rate",
    description:
      "Get attendance statistics: rate, present/absent/late counts. Use when asked about attendance, absenteeism, or which classes have low attendance.",
    input_schema: {
      type: "object" as const,
      properties: {
        class_id: {
          type: "string",
          description: "Filter by class ID.",
        },
        days: {
          type: "number",
          description: "Number of days to look back. Default 30.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_capacity_utilization",
    description:
      "Get classroom capacity utilization: enrolled vs capacity for each class, with available seats. Use when asked about class sizes, whether we're full, or if we can take more students.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_transport_metrics",
    description:
      "Get transport overview: vehicles, drivers, routes, assigned students, and available seats. Use when asked about transport, buses, or school vehicles.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_admissions_pipeline",
    description:
      "Get admissions pipeline: applications by status, conversion rate, stuck applications, and recent activity. Use when asked about admissions, applications, or new students.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_staff_overview",
    description:
      "Get staff overview: headcount by role, monthly/annual payroll, teacher-student ratio. Use when asked about staff, teachers, hiring, or payroll.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "compare_terms",
    description:
      "Compare a metric between two terms (e.g., fee collection this term vs last term). Use when asked to compare periods, track progress, or see how things changed.",
    input_schema: {
      type: "object" as const,
      properties: {
        metric: {
          type: "string",
          description:
            "The metric to compare: 'collection' (fee collection/revenue), 'enrollment' (student numbers).",
        },
        term1_id: {
          type: "string",
          description:
            "First term ID (newer). If omitted, uses current term.",
        },
        term2_id: {
          type: "string",
          description:
            "Second term ID (older). If omitted, uses previous term.",
        },
      },
      required: ["metric"],
    },
  },
  {
    name: "get_report_card_summary",
    description:
      "Get an academic performance summary for a class: average scores, grade distribution, top/bottom students, and subject-level averages. Use when asked about exam results, academic performance, how a class did, or report cards.",
    input_schema: {
      type: "object" as const,
      properties: {
        class_name: {
          type: "string",
          description:
            "Class name to filter by (e.g., 'Grade 4', 'Form 2'). Partial match supported.",
        },
        term_name: {
          type: "string",
          description:
            "Term name to filter by (e.g., 'Term 1', 'Term 2'). Partial match supported.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_teacher_performance",
    description:
      "Get teacher performance metrics: grading activity, classes taught, days since last grade entry, and burnout risk. Can filter by teacher name or return all teachers. Use when asked about teacher performance, who needs support, or which teachers are most active.",
    input_schema: {
      type: "object" as const,
      properties: {
        teacher_name: {
          type: "string",
          description:
            "Teacher name to search for (partial match on first or last name). If omitted, returns all teachers.",
        },
      },
      required: [],
    },
  },
]

// ============================================================================
// Tool Dispatcher
// ============================================================================
export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  userId: string
): Promise<any> {
  switch (toolName) {
    case "get_financial_runway":
      return getFinancialRunway(userId)
    case "get_collection_rate":
      return getCollectionRate(userId, toolInput)
    case "get_fee_arrears":
      return getFeeArrears(userId, toolInput)
    case "get_expense_summary":
      return getExpenseSummary(userId, toolInput)
    case "get_fee_structure":
      return getFeeStructure(userId, toolInput)
    case "get_student_count":
      return getStudentCount(userId, toolInput)
    case "get_enrollment_trend":
      return getEnrollmentTrend(userId, toolInput)
    case "get_attendance_rate":
      return getAttendanceRate(userId, toolInput)
    case "get_capacity_utilization":
      return getCapacityUtilization(userId)
    case "get_transport_metrics":
      return getTransportMetrics(userId)
    case "get_admissions_pipeline":
      return getAdmissionsPipeline(userId)
    case "get_staff_overview":
      return getStaffOverview(userId)
    case "compare_terms":
      return compareTerms(userId, toolInput as any)
    case "get_report_card_summary":
      return getReportCardSummary(toolInput, userId)
    case "get_teacher_performance":
      return getTeacherPerformanceMetrics(toolInput, userId)
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}
