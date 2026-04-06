import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { queueNotification, sendNotification, processNotificationQueue } from "@/lib/services/whatsapp-notifications"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return NextResponse.json({ error: "No school context" }, { status: 403 })
    }

    const body = await request.json()
    const { action, ...data } = body

    if (action === "queue") {
      const notification = await queueNotification({
        ...data,
        school_id: context.schoolId,
      })
      return NextResponse.json({ success: true, data: notification })
    }

    if (action === "send") {
      const result = await sendNotification({
        ...data,
        school_id: context.schoolId,
      })
      return NextResponse.json({ ...result, success: true })
    }

    if (action === "process_queue") {
      const result = await processNotificationQueue(data.limit || 50)
      return NextResponse.json({ ...result, success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("[/api/whatsapp/notifications] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const context = await requireTenantContext(user.id)
    if (!context) {
      return NextResponse.json({ error: "No school context" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")

    let query = supabase
      .from("whatsapp_notification_queue")
      .select("*")
      .eq("school_id", context.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq("status", status)
    }

    const { data: notifications, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ data: notifications || [] })
  } catch (error: any) {
    console.error("[/api/whatsapp/notifications] Error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}


