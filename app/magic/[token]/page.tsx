"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function MagicLinkPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadSession()
  }, [token])

  const loadSession = async () => {
    try {
      const { data, error } = await supabase
        .from("whatsapp_sessions")
        .select("*, invoices(*, students(*))")
        .eq("token", token)
        .single()

      if (error) throw error

      if (!data) {
        setError("Invalid or expired link")
        setLoading(false)
        return
      }

      const sessionData = data as any

      // Check if expired
      if (sessionData.expires_at && new Date(sessionData.expires_at) < new Date()) {
        setError("This link has expired")
        setLoading(false)
        return
      }

      // Check if already used
      if (sessionData.is_used) {
        setError("This link has already been used")
        setLoading(false)
        return
      }

      setSession(sessionData)
    } catch (err: any) {
      setError(err.message || "Failed to load session")
    } finally {
      setLoading(false)
    }
  }

  const handleMpesaPayment = async () => {
    if (!session) return
    const sessionData = session as any
    if (!sessionData.invoices) return

    setProcessing(true)
    try {
      const invoice = sessionData.invoices
      const phoneNumber = sessionData.phone_number

      // Call API route to initiate payment
      const response = await fetch("/api/payments/mpesa/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: (invoice as any).id,
          phoneNumber,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate payment")
      }

      // Mark session as used
      const currentSessionData = session as any
      const sessionUpdateData = { is_used: true, used_at: new Date().toISOString() }
      // @ts-ignore - Supabase strict type checking
      await supabase.from("whatsapp_sessions").update(sessionUpdateData).eq("id", currentSessionData.id)

      alert(data.message || "Payment request sent! Please check your phone to complete the payment.")
    } catch (err: any) {
      setError(err.message || "Failed to initiate payment")
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const sessionData = session as any
  const invoice = sessionData.invoices

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Payment Request</CardTitle>
          <CardDescription>
            {sessionData.purpose === "invoice_payment"
              ? "Pay your invoice using M-Pesa"
              : sessionData.purpose}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invoice && (
            <>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Invoice Reference</p>
                <p className="font-medium">{(invoice as any)?.reference || "N/A"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Student</p>
                <p className="font-medium">
                  {invoice?.students
                    ? `${(invoice.students as any).first_name} ${(invoice.students as any).last_name}`
                    : "N/A"}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="text-2xl font-bold">KES {Number((invoice as any)?.amount || 0).toLocaleString()}</p>
              </div>
              <Button
                onClick={handleMpesaPayment}
                disabled={processing}
                className="w-full"
              >
                {processing ? "Processing..." : "Pay with M-Pesa"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

