"use client"

import { useState, useEffect } from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, MessageCircle, Settings } from "lucide-react"
import { PhoneSetup } from "./phone-setup"
import { motion } from "framer-motion"

interface PhoneSetupCardProps {
  phone?: string | null
  verified?: boolean
  whatsappConfigured?: boolean
}

export function PhoneSetupCard({ 
  phone: initialPhone, 
  verified: initialVerified,
  whatsappConfigured = true 
}: PhoneSetupCardProps) {
  const [showSetup, setShowSetup] = useState(false)
  const [phone, setPhone] = useState(initialPhone)
  const [verified, setVerified] = useState(initialVerified)

  useEffect(() => {
    // Refresh status periodically
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/whatsapp/setup")
        if (response.ok) {
          const data = await response.json()
          setPhone(data.phone)
          setVerified(data.verified)
        }
      } catch (error) {
        console.error("Failed to refresh phone status:", error)
      }
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [])

  // If WhatsApp is not configured, show a disabled state
  if (!whatsappConfigured) {
    return (
      <div className="border border-neutral-200 bg-white rounded-lg p-6 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-neutral-100 text-neutral-500">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold">WhatsApp Chatbot Access</h3>
              <p className="text-sm text-neutral-500">
                WhatsApp integration is not configured. Please set up Twilio environment variables first.
              </p>
            </div>
          </div>
          <Button disabled variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Setup
          </Button>
        </div>
      </div>
    )
  }

  if (showSetup) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <PhoneSetup initialPhone={phone} initialVerified={verified} />
      </motion.div>
    )
  }

  return (
    <div className="border border-neutral-200 bg-white rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-green-600 text-white">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">WhatsApp Chatbot Access</h3>
            <p className="text-sm text-muted-foreground">
              {phone
                ? verified
                  ? "Your phone is verified and ready to use"
                  : "Phone number needs verification"
                : "Configure your phone number to use the chatbot"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {phone && (
            <div className="flex items-center gap-2">
              {verified ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Verified
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-amber-500" />
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Not Verified
                  </span>
                </>
              )}
            </div>
          )}
          <Button onClick={() => setShowSetup(true)} variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            {phone ? "Update" : "Setup"}
          </Button>
        </div>
      </div>
      {phone && (
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <p className="text-sm text-muted-foreground">
            Phone: <span className="font-medium text-neutral-900">{phone}</span>
          </p>
        </div>
      )}
    </div>
  )
}

