"use server"

import { createClient } from "@/lib/supabase/server"
import { WhatsAppClient } from "@/lib/integrations/whatsapp"
import { renderTemplate, getTemplate, formatSaleItems } from "@/lib/templates/whatsapp-templates"
import { requireTenantContext } from "@/lib/supabase/tenant-context"

export interface NotificationData {
  school_id: string
  recipient_phone: string
  recipient_type?: "parent" | "student" | "teacher" | "admin"
  recipient_id?: string
  message_type: "payment_reminder" | "receipt" | "announcement" | "custom"
  template_name?: keyof typeof import("@/lib/templates/whatsapp-templates").WHATSAPP_TEMPLATES
  variables: Record<string, any>
  scheduled_at?: string
}

/**
 * Queue a WhatsApp notification
 */
export async function queueNotification(data: NotificationData) {
  const supabase = await createClient()

  const notificationData: any = {
    school_id: data.school_id,
    recipient_phone: data.recipient_phone,
    recipient_type: data.recipient_type || "parent",
    recipient_id: data.recipient_id || null,
    message_type: data.message_type,
    variables: data.variables,
    scheduled_at: data.scheduled_at || new Date().toISOString(),
  }

  const { data: notification, error } = await supabase
    .from("whatsapp_notification_queue")
    .insert(notificationData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to queue notification: ${error.message}`)
  }

  return notification
}

/**
 * Send a WhatsApp notification immediately
 */
export async function sendNotification(data: NotificationData) {
  // Check if Twilio is configured
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_WHATSAPP_NUMBER
  ) {
    throw new Error("WhatsApp is not configured. Please set Twilio environment variables.")
  }

  const whatsapp = new WhatsAppClient({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  })

  // Get template
  const template = data.template_name
    ? getTemplate(data.template_name)
    : data.variables.message || ""

  // Render template with variables
  const messageBody = renderTemplate(template, data.variables)

  try {
    // Send message
    const result = await whatsapp.sendMessage({
      to: data.recipient_phone,
      body: messageBody,
    })

    // Log to notification_logs table
    const supabase = await createClient()
    await (supabase.from("notification_logs") as any).insert({
      school_id: data.school_id,
      recipient_id: data.recipient_id || null,
      channel: "whatsapp",
      message: messageBody,
      status: "sent",
      external_id: result.messageSid,
      sent_at: new Date().toISOString(),
    })

    return { success: true, messageSid: result.messageSid }
  } catch (error: any) {
    // Log error
    const supabase = await createClient()
    await (supabase.from("notification_logs") as any).insert({
      school_id: data.school_id,
      recipient_id: data.recipient_id || null,
      channel: "whatsapp",
      message: messageBody,
      status: "failed",
      error_message: error.message,
    })

    throw error
  }
}

/**
 * Send payment reminder to parent
 */
export async function sendPaymentReminder(studentId: string, invoiceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Not authenticated")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    throw new Error("No school context")
  }

  // Get invoice and student details
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      students!inner(
        id,
        first_name,
        last_name,
        admission_number,
        guardians!inner(
          id,
          name,
          phone
        )
      )
    `)
    .eq("id", invoiceId)
    .eq("students.id", studentId)
    .eq("students.school_id", context.schoolId)
    .single()

  if (!invoice) {
    throw new Error("Invoice not found")
  }

  const student = (invoice as any).students
  const guardian = student?.guardians?.[0] || student?.guardians

  if (!guardian?.phone) {
    throw new Error("Guardian phone number not found")
  }

  // Get school details
  const { data: school } = await supabase
    .from("schools")
    .select("name")
    .eq("id", context.schoolId)
    .single()

  // Format phone number (ensure it starts with country code)
  let phoneNumber = guardian.phone.replace(/\D/g, "") // Remove non-digits
  if (!phoneNumber.startsWith("254")) {
    // Assume Kenya, add country code if missing
    if (phoneNumber.startsWith("0")) {
      phoneNumber = "254" + phoneNumber.substring(1)
    } else {
      phoneNumber = "254" + phoneNumber
    }
  }

  // Generate payment link
  const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/magic/payment/${invoiceId}`

  const variables = {
    guardian_name: (guardian as any).name,
    student_name: `${(student as any).first_name} ${(student as any).last_name}`,
    admission_number: (student as any).admission_number || "",
    amount_due: Number((invoice as any).amount).toLocaleString(),
    due_date: (invoice as any).due_date
      ? new Date((invoice as any).due_date).toLocaleDateString("en-KE")
      : "N/A",
    invoice_number: (invoice as any).reference,
    payment_link: paymentLink,
    school_name: (school as any)?.name || "School",
  }

  return await sendNotification({
    school_id: context.schoolId,
    recipient_phone: phoneNumber,
    recipient_type: "parent",
    recipient_id: guardian.id,
    message_type: "payment_reminder",
    template_name: "payment_reminder",
    variables,
  })
}

/**
 * Send receipt after payment or sale
 */
export async function sendReceipt(
  recipientPhone: string,
  receiptData: {
    receipt_type: string
    reference_number: string
    amount: number
    date: string
    payment_method: string
    receipt_link?: string
    school_id: string
    recipient_id?: string
  }
) {
  const supabase = await createClient()

  // Get school details
  const { data: school } = await supabase
    .from("schools")
    .select("name")
    .eq("id", receiptData.school_id)
    .single()

  // Format phone number
  let phoneNumber = recipientPhone.replace(/\D/g, "")
  if (!phoneNumber.startsWith("254")) {
    if (phoneNumber.startsWith("0")) {
      phoneNumber = "254" + phoneNumber.substring(1)
    } else {
      phoneNumber = "254" + phoneNumber
    }
  }

  const variables = {
    receipt_type: receiptData.receipt_type,
    reference_number: receiptData.reference_number,
    amount: receiptData.amount.toLocaleString(),
    date: new Date(receiptData.date).toLocaleDateString("en-KE"),
    payment_method: receiptData.payment_method,
    receipt_link: receiptData.receipt_link || "",
    school_name: (school as any)?.name || "School",
  }

  return await sendNotification({
    school_id: receiptData.school_id,
    recipient_phone: phoneNumber,
    recipient_type: "parent",
    recipient_id: receiptData.recipient_id,
    message_type: "receipt",
    template_name: "receipt",
    variables,
  })
}

/**
 * Send uniform sale receipt
 */
export async function sendUniformSaleReceipt(
  saleId: string,
  schoolId: string
) {
  const supabase = await createClient()

  // Get sale details
  const { data: sale } = await supabase
    .from("uniform_sales")
    .select(`
      *,
      uniform_sale_items(
        *,
        uniform_variants(
          size,
          color,
          uniform_products(name)
        )
      ),
      students(first_name, last_name, admission_number),
      schools(name)
    `)
    .eq("id", saleId)
    .eq("school_id", schoolId)
    .single()

  if (!sale) {
    throw new Error("Sale not found")
  }

  // Get recipient phone
  let recipientPhone = (sale as any).customer_phone
  if (!recipientPhone && (sale as any).students) {
    // Get guardian phone
    const { data: guardians } = await supabase
      .from("guardians")
      .select("phone")
      .eq("student_id", (sale as any).student_id)
      .eq("is_primary", true)
      .single()

    recipientPhone = (guardians as any)?.phone
  }

  if (!recipientPhone) {
    throw new Error("Recipient phone number not found")
  }

  // Format phone number
  let phoneNumber = recipientPhone.replace(/\D/g, "")
  if (!phoneNumber.startsWith("254")) {
    if (phoneNumber.startsWith("0")) {
      phoneNumber = "254" + phoneNumber.substring(1)
    } else {
      phoneNumber = "254" + phoneNumber
    }
  }

  // Format items
  const items = ((sale as any).uniform_sale_items || []).map((item: any) => ({
    product_name: item.uniform_variants?.uniform_products?.name || "Product",
    variant_name: `${item.uniform_variants?.size || ""} - ${item.uniform_variants?.color || ""}`,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
  }))

  const itemsText = formatSaleItems(items)

  const receiptLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/store/sales/${saleId}/receipt`

  const variables = {
    sale_number: (sale as any).sale_number,
    sale_date: new Date((sale as any).sale_date).toLocaleDateString("en-KE"),
    total_amount: Number((sale as any).total_amount).toLocaleString(),
    payment_method: (sale as any).payment_method,
    items: itemsText,
    receipt_link: receiptLink,
    school_name: (sale as any).schools?.name || "School",
  }

  // Use custom template for uniform sale
  const template = `✅ Uniform Sale Receipt

Sale Number: {{sale_number}}
📅 Date: {{sale_date}}
💰 Total: KES {{total_amount}}
💳 Payment: {{payment_method}}

Items:
{{items}}

View receipt: {{receipt_link}}

Thank you,
{{school_name}}`

  return await sendNotification({
    school_id: schoolId,
    recipient_phone: phoneNumber,
    recipient_type: "parent",
    recipient_id: (sale as any).student_id,
    message_type: "receipt",
    variables: {
      ...variables,
      message: renderTemplate(template, variables),
    },
  })
}

/**
 * Broadcast announcement via WhatsApp
 */
export async function sendAnnouncement(
  announcementId: string,
  schoolId: string,
  recipientPhones?: string[]
) {
  const supabase = await createClient()

  // Get announcement
  const { data: announcement } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", announcementId)
    .eq("school_id", schoolId)
    .single()

  if (!announcement) {
    throw new Error("Announcement not found")
  }

  // Get school details
  const { data: school } = await supabase
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single()

  // Get recipient phones if not provided
  let phones = recipientPhones || []

  if (phones.length === 0) {
    // Get phones based on target_audience
    const targetAudience = (announcement as any).target_audience || "all"

    if (targetAudience === "all" || targetAudience === "parents") {
      // Get all parent phone numbers
      const { data: guardians } = await supabase
        .from("guardians")
        .select("phone")
        .eq("school_id", schoolId)
        .not("phone", "is", null)

      phones = (guardians || [])
        .map((g: any) => g.phone)
        .filter((p: string) => p)
    } else if ((announcement as any).target_classes) {
      // Get parents of students in specific classes
      const classIds = (announcement as any).target_classes || []
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("student_id")
        .in("class_id", classIds)
        .eq("school_id", schoolId)

      const studentIds = (enrollments || []).map((e: any) => e.student_id)

      if (studentIds.length > 0) {
        const { data: guardians } = await supabase
          .from("guardians")
          .select("phone")
          .in("student_id", studentIds)
          .not("phone", "is", null)

        phones = (guardians || [])
          .map((g: any) => g.phone)
          .filter((p: string) => p)
      }
    }
  }

  if (phones.length === 0) {
    throw new Error("No recipients found for announcement")
  }

  // Format phone numbers and send
  const results = []
  for (const phone of phones) {
    let phoneNumber = phone.replace(/\D/g, "")
    if (!phoneNumber.startsWith("254")) {
      if (phoneNumber.startsWith("0")) {
        phoneNumber = "254" + phoneNumber.substring(1)
      } else {
        phoneNumber = "254" + phoneNumber
      }
    }

    const variables = {
      announcement_title: (announcement as any).title,
      announcement_content: (announcement as any).content,
      link: (announcement as any).link || "",
      school_name: (school as any)?.name || "School",
    }

    try {
      const result = await sendNotification({
        school_id: schoolId,
        recipient_phone: phoneNumber,
        recipient_type: "parent",
        message_type: "announcement",
        template_name: "announcement",
        variables,
      })
      results.push({ ...result, phone: phoneNumber, success: true })
    } catch (error: any) {
      results.push({ phone: phoneNumber, success: false, error: error.message })
    }
  }

  return results
}

/**
 * Process notification queue
 */
export async function processNotificationQueue(limit: number = 50) {
  const supabase = await createClient()

  // Get pending notifications
  const { data: notifications } = await supabase
    .from("whatsapp_notification_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit)

  if (!notifications || notifications.length === 0) {
    return { processed: 0, success: 0, failed: 0 }
  }

  let success = 0
  let failed = 0

  for (const notification of notifications) {
    try {
      // Get template
      const template = getTemplate(
        (notification as any).template_name as any
      ) || (notification as any).variables?.message || ""

      // Render message
      const messageBody = renderTemplate(template, (notification as any).variables || {})

      // Send via WhatsApp
      if (
        !process.env.TWILIO_ACCOUNT_SID ||
        !process.env.TWILIO_AUTH_TOKEN ||
        !process.env.TWILIO_WHATSAPP_NUMBER
      ) {
        throw new Error("WhatsApp not configured")
      }

      const whatsapp = new WhatsAppClient({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
      })

      const result = await whatsapp.sendMessage({
        to: (notification as any).recipient_phone,
        body: messageBody,
      })

      // Update notification status
      await (supabase
        .from("whatsapp_notification_queue") as any)
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          external_message_id: result.messageSid,
        })
        .eq("id", (notification as any).id)

      // Log to notification_logs
      await (supabase.from("notification_logs") as any).insert({
        school_id: (notification as any).school_id,
        recipient_id: (notification as any).recipient_id,
        channel: "whatsapp",
        message: messageBody,
        status: "sent",
        external_id: result.messageSid,
        sent_at: new Date().toISOString(),
      })

      success++
    } catch (error: any) {
      // Update notification status
      await (supabase
        .from("whatsapp_notification_queue") as any)
        .update({
          status: "failed",
          error_message: error.message,
        })
        .eq("id", (notification as any).id)

      // Log error
      await (supabase.from("notification_logs") as any).insert({
        school_id: (notification as any).school_id,
        recipient_id: (notification as any).recipient_id,
        channel: "whatsapp",
        message: (notification as any).variables?.message || "",
        status: "failed",
        error_message: error.message,
      })

      failed++
    }
  }

  return { processed: notifications.length, success, failed }
}


