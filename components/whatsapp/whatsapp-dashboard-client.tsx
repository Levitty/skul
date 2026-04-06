"use client"

import { motion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
  MessageSquare, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock,
  Bot,
  Users,
  TrendingUp,
  AlertTriangle
} from "lucide-react"
import { formatCurrency } from "@/lib/utils/receipt-generator"
import { PhoneSetupCard } from "./phone-setup-card"

interface WhatsAppDashboardClientProps {
  notifications: any[]
  sessions: any[]
  stats: {
    total: number
    sent: number
    delivered: number
    failed: number
    pending: number
    activeSessions: number
  }
  phoneStatus?: {
    phone: string | null
    verified: boolean
  } | null
  whatsappConfigured?: boolean
  missingEnvVars?: string[]
}

export function WhatsAppDashboardClient({
  notifications,
  sessions,
  stats,
  phoneStatus,
  whatsappConfigured = true,
  missingEnvVars = [],
}: WhatsAppDashboardClientProps) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      sent: { variant: "default", label: "Sent" },
      delivered: { variant: "default", label: "Delivered" },
      failed: { variant: "destructive", label: "Failed" },
      pending: { variant: "secondary", label: "Pending" },
    }

    const config = variants[status] || { variant: "outline" as const, label: status }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            WhatsApp Integration
          </h1>
          <p className="text-neutral-500 mt-1">
            Manage notifications and chatbot
          </p>
        </div>
      </motion.div>

      {/* WhatsApp Configuration Warning */}
      {!whatsappConfigured && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                WhatsApp Not Configured
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                WhatsApp integration requires Twilio configuration. Please set the following environment variables in your <code className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded text-xs">.env.local</code> file:
              </p>
              <ul className="list-disc list-inside text-sm text-amber-800 dark:text-amber-200 space-y-1">
                {missingEnvVars.map((envVar) => (
                  <li key={envVar}>
                    <code className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded text-xs">{envVar}</code>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                After setting these variables, restart your development server for the changes to take effect.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Phone Setup Card */}
      {phoneStatus && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <PhoneSetupCard 
            phone={phoneStatus.phone} 
            verified={phoneStatus.verified}
            whatsappConfigured={whatsappConfigured}
          />
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="border border-neutral-200 bg-white rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-600 text-white">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Sent</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="border border-neutral-200 bg-white rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-600 text-white">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Delivered</p>
              <p className="text-2xl font-bold">{stats.delivered}</p>
            </div>
          </div>
        </div>

        <div className="border border-neutral-200 bg-white rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-600 text-white">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Pending</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="border border-neutral-200 bg-white rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-600 text-white">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Active Sessions</p>
              <p className="text-2xl font-bold">{stats.activeSessions}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Notifications */}
      <GlassCard variant="default" className="p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Notifications</h2>
        {notifications.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.slice(0, 10).map((notification, index) => (
                <motion.tr
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-neutral-50"
                >
                  <TableCell className="font-medium">
                    {notification.recipient_phone}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {notification.message_type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(notification.status)}</TableCell>
                  <TableCell>
                    {notification.sent_at
                      ? new Date(notification.sent_at).toLocaleString()
                      : notification.scheduled_at
                      ? `Scheduled: ${new Date(notification.scheduled_at).toLocaleString()}`
                      : "Not sent"}
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-neutral-500" />
            <h3 className="text-lg font-semibold mb-2">No notifications yet</h3>
            <p className="text-neutral-500">
              Notifications will appear here when sent
            </p>
          </div>
        )}
      </GlassCard>

      {/* Chatbot Sessions */}
      <GlassCard variant="default" className="p-6">
        <h2 className="text-lg font-semibold mb-4">Chatbot Sessions</h2>
        {sessions.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Interaction</TableHead>
                <TableHead>Messages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session, index) => (
                <motion.tr
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-neutral-50"
                >
                  <TableCell className="font-medium">
                    {session.phone_number}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        session.session_state === "active"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {session.session_state}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(session.last_interaction_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {(session.whatsapp_chatbot_messages as any)?.length || 0}
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12">
            <Bot className="w-16 h-16 mx-auto mb-4 text-neutral-500" />
            <h3 className="text-lg font-semibold mb-2">No chatbot sessions yet</h3>
            <p className="text-neutral-500">
              Sessions will appear when users interact with the chatbot
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

