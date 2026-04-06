/**
 * WhatsApp Message Templates
 * Template-based messages with variable substitution
 */

export interface TemplateVariables {
  [key: string]: string | number | null | undefined
}

/**
 * Render a template string with variables
 * Replaces {{variable_name}} with actual values
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  let rendered = template

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`
    const replacement = value !== null && value !== undefined ? String(value) : ""
    rendered = rendered.replace(new RegExp(placeholder, "g"), replacement)
  }

  // Remove any remaining placeholders
  rendered = rendered.replace(/\{\{[^}]+\}\}/g, "")

  return rendered.trim()
}

/**
 * WhatsApp Message Templates
 */
export const WHATSAPP_TEMPLATES = {
  payment_reminder: `Dear {{guardian_name}},

Your child {{student_name}} ({{admission_number}}) has an outstanding fee balance:

💰 Amount Due: KES {{amount_due}}
📅 Due Date: {{due_date}}
📄 Invoice: {{invoice_number}}

Pay now: {{payment_link}}

Thank you,
{{school_name}}`,

  receipt: `✅ Receipt Confirmed

{{receipt_type}}: {{reference_number}}
💰 Amount: KES {{amount}}
📅 Date: {{date}}
💳 Payment Method: {{payment_method}}

View receipt: {{receipt_link}}

Thank you,
{{school_name}}`,

  announcement: `📢 {{announcement_title}}

{{announcement_content}}

{{#if link}}
More info: {{link}}
{{/if}}

- {{school_name}}`,

  uniform_sale_receipt: `✅ Uniform Sale Receipt

Sale Number: {{sale_number}}
📅 Date: {{sale_date}}
💰 Total: KES {{total_amount}}
💳 Payment: {{payment_method}}

Items:
{{items}}

View receipt: {{receipt_link}}

Thank you,
{{school_name}}`,

  report_card: `📋 Report Card — {{student_name}}

Class: {{class_name}} | {{term_name}} ({{academic_year}})
Overall: {{overall_percentage}}% (Grade {{overall_grade}})
Rank: {{class_rank}} of {{class_size}}
Attendance: {{attendance_percentage}}%

{{#if teacher_remarks}}
Remarks: {{teacher_remarks}}
{{/if}}

View the full report card in the school portal.

— {{school_name}}`,

  chatbot_greeting: `👋 Hello! I'm the Tuta Strategic Advisor.

I can help you with:
• Financial insights
• Student metrics
• Strategic analysis
• KPI queries

Ask me anything about your school's performance!

Example: "What's our collection velocity?"`,

  chatbot_help: `📚 Available Commands:

• "What's our collection velocity?"
• "Show me low stock items"
• "What's our student retention rate?"
• "Financial runway"
• "Capacity utilization"

Or ask any strategic question about your school!`,

  chatbot_error: `❌ I couldn't process that request.

Please try:
• Rephrasing your question
• Using "help" to see available commands
• Contacting support if the issue persists`,
}

/**
 * Get template by name
 */
export function getTemplate(templateName: keyof typeof WHATSAPP_TEMPLATES): string {
  return WHATSAPP_TEMPLATES[templateName] || ""
}

/**
 * Format items list for uniform sale receipt
 */
export function formatSaleItems(items: Array<{
  product_name: string
  variant_name: string
  quantity: number
  unit_price: number
  total_price: number
}>): string {
  return items
    .map(
      (item) =>
        `• ${item.product_name} - ${item.variant_name} (${item.quantity}x) = KES ${item.total_price.toLocaleString()}`
    )
    .join("\n")
}


