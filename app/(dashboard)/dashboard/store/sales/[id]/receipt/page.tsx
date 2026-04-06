import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { redirect } from "next/navigation"
import { generateReceipt } from "@/lib/actions/uniform-sales"
import { ReceiptView } from "@/components/store/receipt-view"

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  const { id } = await params
  const receiptData = await generateReceipt(id)

  return <ReceiptView receiptData={receiptData} />
}


