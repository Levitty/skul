"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  DollarSign,
  TrendingUp,
  Clock,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  FileText,
  CreditCard,
  PiggyBank,
  Receipt,
  BarChart3,
  CheckCircle,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FinanceDashboardClientProps {
  totalFeeRevenue: number
  totalFeeInvoiced: number
  outstandingFeeAmount: number
  feeCollectionRate: number
  totalOtherIncome: number
  totalExpenses: number
  netProfit: number
  cashBalance: number
  totalAccountsPayable: number
  recentPayments: any[]
  recentInvoices: any[]
  recentOtherIncome: any[]
  recentExpenses: any[]
  overdueInvoices: any[]
  overduePayables: any[]
  budgets: any[]
}

function formatKES(amount: number) {
  if (Math.abs(amount) >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(2)}M`
  if (Math.abs(amount) >= 1_000) return `KES ${(amount / 1_000).toFixed(1)}K`
  return `KES ${amount.toLocaleString()}`
}

export function FinanceDashboardClient({
  totalFeeRevenue,
  totalFeeInvoiced,
  outstandingFeeAmount,
  feeCollectionRate,
  totalOtherIncome,
  totalExpenses,
  netProfit,
  cashBalance,
  totalAccountsPayable,
  recentPayments,
  recentInvoices,
  overdueInvoices,
  overduePayables,
}: FinanceDashboardClientProps) {
  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Finance & Accounting</h1>
          <p className="text-sm text-muted-foreground mt-1">Financial overview and key metrics</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/accountant/finance/reports">
              <BarChart3 className="w-4 h-4 mr-2" />
              Reports
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/accountant/fees/record-payment">
              <CreditCard className="w-4 h-4 mr-2" />
              Record Payment
            </Link>
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {(overdueInvoices.length > 0 || overduePayables.length > 0) && (
        <div className="rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800/40 px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">Attention Required</span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-red-700 dark:text-red-300">
            {overdueInvoices.length > 0 && (
              <Link href="/dashboard/accountant/fees/invoices?status=overdue" className="underline underline-offset-2 hover:no-underline">
                {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? "s" : ""}
              </Link>
            )}
            {overduePayables.length > 0 && (
              <Link href="/dashboard/accountant/finance/accounts-payable?status=overdue" className="underline underline-offset-2 hover:no-underline">
                {overduePayables.length} overdue payable{overduePayables.length !== 1 ? "s" : ""}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Primary Stat Cards */}
      <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
          label="Fee Revenue"
          value={formatKES(totalFeeRevenue)}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
          label="Collection Rate"
          value={`${feeCollectionRate.toFixed(1)}%`}
          change={
            feeCollectionRate >= 80
              ? { value: "On track", up: true }
              : { value: "Below target", up: false }
          }
          progress={feeCollectionRate}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
          label="Outstanding Fees"
          value={formatKES(outstandingFeeAmount)}
          change={
            overdueInvoices.length > 0
              ? { value: `${overdueInvoices.length} overdue`, up: false }
              : undefined
          }
        />
        <StatCard
          icon={<Wallet className="w-5 h-5" />}
          iconBg="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
          label="Cash Balance"
          value={formatKES(cashBalance)}
        />
      </div>

      {/* Secondary Stat Cards */}
      <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
        <StatCardSmall icon={<PiggyBank className="w-4 h-4" />} label="Other Income" value={formatKES(totalOtherIncome)} />
        <StatCardSmall
          icon={<Receipt className="w-4 h-4" />}
          label="Total Expenses"
          value={formatKES(totalExpenses)}
          negative
        />
        <StatCardSmall
          icon={netProfit >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          label="Net Profit"
          value={formatKES(netProfit)}
          highlight={netProfit >= 0 ? "green" : "red"}
        />
        <StatCardSmall
          icon={<FileText className="w-4 h-4" />}
          label="Accounts Payable"
          value={formatKES(totalAccountsPayable)}
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <ActionLink href="/dashboard/accountant/fees/record-payment" icon={<CreditCard className="w-4 h-4" />} label="Record Payment" />
          <ActionLink href="/dashboard/accountant/fees/invoices/generate" icon={<FileText className="w-4 h-4" />} label="Generate Invoice" />
          <ActionLink href="/dashboard/accountant/finance/expenses" icon={<Receipt className="w-4 h-4" />} label="Record Expense" />
          <ActionLink href="/dashboard/accountant/finance/other-income" icon={<PiggyBank className="w-4 h-4" />} label="Other Income" />
          <ActionLink href="/dashboard/accountant/finance/budgets" icon={<BarChart3 className="w-4 h-4" />} label="Create Budget" />
          <ActionLink href="/dashboard/accountant/finance/bank-reconciliation" icon={<CheckCircle className="w-4 h-4" />} label="Reconcile Bank" />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Recent Fee Payments</h3>
            <Link
              href="/dashboard/accountant/fees"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentPayments.length > 0 ? (
            <div className="space-y-3">
              {recentPayments.slice(0, 5).map((payment: any) => (
                <div key={payment.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {payment.invoices?.students?.first_name} {payment.invoices?.students?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payment.invoices?.reference} &middot; {payment.method}
                    </p>
                  </div>
                  <div className="text-right pl-4">
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      KES {Number(payment.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(payment.paid_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No recent payments</p>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Recent Fee Invoices</h3>
            <Link
              href="/dashboard/accountant/fees/invoices"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentInvoices.length > 0 ? (
            <div className="space-y-3">
              {recentInvoices.slice(0, 5).map((invoice: any) => (
                <div key={invoice.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{invoice.reference || invoice.id.slice(0, 8)}</p>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        invoice.status === "paid" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                        invoice.status === "overdue" && "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
                        invoice.status === "unpaid" && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
                        invoice.status === "partial" && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                      )}
                    >
                      {invoice.status}
                    </span>
                  </div>
                  <div className="text-right pl-4">
                    <p className="text-sm font-semibold tabular-nums">KES {Number(invoice.amount).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{new Date(invoice.issued_date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No recent invoices</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  change,
  progress,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  change?: { value: string; up: boolean }
  progress?: number
}) {
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white p-5 flex flex-col gap-3 hover:border-neutral-300/80 transition-all duration-200" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center justify-between">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>{icon}</div>
        {change && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg ${
              change.up
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-rose-50 text-rose-600 dark:bg-red-950/40 dark:text-red-400"
            }`}
          >
            {change.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {change.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-[28px] font-bold tabular-nums text-foreground tracking-tight leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
      </div>
      {progress !== undefined && (
        <div className="h-2 w-full rounded-full bg-emerald-50 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function StatCardSmall({
  icon,
  label,
  value,
  negative,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  negative?: boolean
  highlight?: "green" | "red"
}) {
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white px-5 py-4 flex items-center gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className={cn(
        "p-2 rounded-lg",
        highlight === "green" ? "bg-emerald-50 text-emerald-600" :
        highlight === "red" ? "bg-rose-50 text-rose-600" :
        negative ? "bg-rose-50 text-rose-500" :
        "bg-neutral-100 text-neutral-500"
      )}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-base font-bold tabular-nums",
            highlight === "green" && "text-emerald-600 dark:text-emerald-400",
            highlight === "red" && "text-rose-600 dark:text-red-400",
            negative && !highlight && "text-rose-600",
            !highlight && !negative && "text-foreground"
          )}
        >
          {negative && !value.startsWith("-") ? `-${value}` : value}
        </p>
      </div>
    </div>
  )
}

function ActionLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-50/50 transition-all duration-200 group"
    >
      <div className="p-2 rounded-lg bg-neutral-100 text-neutral-500 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-all duration-200">{icon}</div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </Link>
  )
}
