"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GlassCard } from "@/components/ui/glass-card"
import { CheckCircle, XCircle, Loader2, MessageCircle, Phone, AlertTriangle } from "lucide-react"
import { formatPhoneNumber, validatePhoneNumber } from "@/lib/utils/phone-format"

interface PhoneSetupProps {
  initialPhone?: string | null
  initialVerified?: boolean
}

export function PhoneSetup({ initialPhone, initialVerified }: PhoneSetupProps) {
  const [phone, setPhone] = useState(initialPhone || "")
  const [verified, setVerified] = useState(initialVerified || false)
  const [loading, setLoading] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [whatsappConfigured, setWhatsappConfigured] = useState<boolean | null>(null)
  const [missingEnvVars, setMissingEnvVars] = useState<string[]>([])

  // Check WhatsApp configuration on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch("/api/whatsapp/setup")
        if (response.ok) {
          const data = await response.json()
          setWhatsappConfigured(data.whatsappConfigured ?? true)
          setMissingEnvVars(data.missingEnvVars || [])
        }
      } catch (error) {
        console.error("Failed to check WhatsApp configuration:", error)
        setWhatsappConfigured(true) // Default to true to avoid blocking UI
      }
    }
    checkConfig()
  }, [])

  const handleUpdatePhone = async () => {
    setError(null)
    setSuccess(null)
    setLoading(true)

    const formatted = formatPhoneNumber(phone)
    const validation = validatePhoneNumber(formatted)

    if (!validation.valid) {
      setError(validation.error || null)
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/whatsapp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatted }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update phone number")
      }

      setPhone(formatted)
      setVerified(false)
      setCodeSent(false)
      setSuccess("Phone number updated successfully. You can now send a verification code.")
    } catch (err: any) {
      // Handle different error types
      const errorMessage = err instanceof Error 
        ? err.message 
        : typeof err === 'string' 
        ? err 
        : err?.message || String(err) || "Failed to update phone number"
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleSendCode = async () => {
    setError(null)
    setSuccess(null)
    setLoading(true)

    // Ensure phone is formatted
    const formatted = formatPhoneNumber(phone)
    const validation = validatePhoneNumber(formatted)

    if (!validation.valid) {
      setError(validation.error || "Please enter a valid phone number first")
      setLoading(false)
      return
    }

    // If phone hasn't been saved yet, save it first
    if (phone !== formatted) {
      try {
        const updateResponse = await fetch("/api/whatsapp/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: formatted }),
        })

        if (!updateResponse.ok) {
          const updateData = await updateResponse.json()
          throw new Error(updateData.error || "Failed to update phone number")
        }

        setPhone(formatted)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
        return
      }
    }

    try {
      const response = await fetch("/api/whatsapp/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_code", phone: formatted }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code")
      }

      setCodeSent(true)
      setSuccess("Verification code sent to your WhatsApp")
    } catch (err: any) {
      // Handle different error types
      const errorMessage = err instanceof Error 
        ? err.message 
        : typeof err === 'string' 
        ? err 
        : err?.message || String(err) || "Failed to send verification code"
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setError(null)
    setSuccess(null)
    setVerifying(true)

    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a valid 6-digit code")
      setVerifying(false)
      return
    }

    try {
      const response = await fetch("/api/whatsapp/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_code", code: verificationCode }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to verify code")
      }

      setVerified(true)
      setCodeSent(false)
      setVerificationCode("")
      setSuccess("Phone number verified successfully! You can now use the WhatsApp chatbot.")
    } catch (err: any) {
      // Handle different error types
      const errorMessage = err instanceof Error 
        ? err.message 
        : typeof err === 'string' 
        ? err 
        : err?.message || String(err) || "Failed to verify code"
      setError(errorMessage)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="border border-neutral-200 bg-white rounded-lg p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-600 text-white">
          <Phone className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">WhatsApp Phone Setup</h3>
          <p className="text-sm text-neutral-500">
            Configure your phone number to use the WhatsApp chatbot
          </p>
        </div>
      </div>

      {/* WhatsApp Configuration Warning */}
      {whatsappConfigured === false && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 mb-1 text-sm">
                WhatsApp Not Configured
              </h4>
              <p className="text-xs text-amber-800 mb-2">
                Please set the following environment variables in your <code className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded">.env.local</code> file:
              </p>
              <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
                {missingEnvVars.map((envVar) => (
                  <li key={envVar}>
                    <code className="px-1.5 py-0.5 bg-amber-100 rounded">{envVar}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Current Status */}
      {phone && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-neutral-50">
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
          <span className="text-sm text-neutral-500 ml-auto">{phone}</span>
        </div>
      )}

      {/* Phone Number Input */}
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <div className="flex gap-2">
          <Input
            id="phone"
            type="tel"
            placeholder="+254712345678 or 0712345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading || verifying}
            className="flex-1"
          />
          <Button
            onClick={handleUpdatePhone}
            disabled={loading || verifying || !phone}
            variant="outline"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              "Update"
            )}
          </Button>
        </div>
        <p className="text-xs text-neutral-500">
          Enter your phone number in Kenya format (e.g., +254712345678 or 0712345678)
        </p>
      </div>

      {/* Verification Code Section */}
      {phone && !verified && (
        <div className="space-y-4 pt-4 border-t border-border/50">
          {!codeSent ? (
            <div className="space-y-2">
              <p className="text-sm text-neutral-500">
                Click the button below to receive a verification code via WhatsApp
              </p>
              <Button
                onClick={handleSendCode}
                disabled={loading || verifying || whatsappConfigured === false}
                className="w-full"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Send Verification Code
              </Button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <Label htmlFor="code">Verification Code</Label>
              <p className="text-xs text-neutral-500">
                Enter the 6-digit code sent to your WhatsApp
              </p>
              <div className="flex gap-2">
                <Input
                  id="code"
                  type="text"
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 6)
                    setVerificationCode(value)
                  }}
                  disabled={verifying}
                  className="flex-1 text-center text-lg tracking-widest"
                  maxLength={6}
                />
                <Button
                  onClick={handleVerifyCode}
                  disabled={verifying || verificationCode.length !== 6}
                  className="min-w-[100px]"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCodeSent(false)
                  setVerificationCode("")
                  setError(null)
                }}
                className="w-full text-xs"
              >
                Request New Code
              </Button>
            </motion.div>
          )}
        </div>
      )}

      {/* Success/Error Messages */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          >
            <p className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
          >
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions */}
      {verified && (
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
            Setup Complete!
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            You can now use the WhatsApp chatbot by sending messages to your school&apos;s WhatsApp
            number. Ask strategic questions like &quot;What&apos;s our collection velocity?&quot; or &quot;Show me low
            stock items&quot;.
          </p>
        </div>
      )}
    </div>
  )
}

