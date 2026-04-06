"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface FinancialReportsClientProps {
  reportType: string
  startDate: string
  endDate: string
  glEntries: any[]
  trialBalance: any[]
  accounts: any[]
  invoices: any[]
  payments: any[]
  expenses: any[]
  otherIncome: any[]
}

export function FinancialReportsClient({
  reportType,
  startDate,
  endDate,
  glEntries,
  trialBalance,
  accounts,
  invoices,
  payments,
  expenses,
  otherIncome,
}: FinancialReportsClientProps) {
  const router = useRouter()
  const [localStartDate, setLocalStartDate] = useState(startDate)
  const [localEndDate, setLocalEndDate] = useState(endDate)
  const [localReportType, setLocalReportType] = useState(reportType)

  const handleDateChange = () => {
    router.push(`/dashboard/accountant/finance/reports?startDate=${localStartDate}&endDate=${localEndDate}&report=${localReportType}`)
  }

  const handleReportChange = (type: string) => {
    setLocalReportType(type)
    router.push(`/dashboard/accountant/finance/reports?startDate=${localStartDate}&endDate=${localEndDate}&report=${type}`)
  }

  // Calculate P&L
  const calculatePL = () => {
    // Revenue (from GL credit entries on revenue accounts)
    const revenueAccounts = accounts.filter((a: any) => a.account_type === "revenue")
    const revenueAccountIds = revenueAccounts.map((a: any) => a.id)
    
    const revenueEntries = glEntries.filter((e: any) => 
      revenueAccountIds.includes(e.account_id) && Number(e.credit_amount) > 0
    )
    const totalRevenue = revenueEntries.reduce((sum: number, e: any) => sum + Number(e.credit_amount || 0), 0)

    // Fee Revenue (PRIMARY) - accounts 4000-4500
    const feeRevenueAccounts = revenueAccounts.filter((a: any) => 
      parseInt(a.account_code) >= 4000 && parseInt(a.account_code) < 4600
    )
    const feeRevenueAccountIds = feeRevenueAccounts.map((a: any) => a.id)
    const feeRevenueEntries = glEntries.filter((e: any) => 
      feeRevenueAccountIds.includes(e.account_id) && Number(e.credit_amount) > 0
    )
    const feeRevenue = feeRevenueEntries.reduce((sum: number, e: any) => sum + Number(e.credit_amount || 0), 0)

    // Other Income (SECONDARY) - accounts 4600-4900
    const otherIncomeAccounts = revenueAccounts.filter((a: any) => 
      parseInt(a.account_code) >= 4600 && parseInt(a.account_code) < 5000
    )
    const otherIncomeAccountIds = otherIncomeAccounts.map((a: any) => a.id)
    const otherIncomeEntries = glEntries.filter((e: any) => 
      otherIncomeAccountIds.includes(e.account_id) && Number(e.credit_amount) > 0
    )
    const otherIncomeTotal = otherIncomeEntries.reduce((sum: number, e: any) => sum + Number(e.credit_amount || 0), 0)

    // Expenses (from GL debit entries on expense accounts)
    const expenseAccounts = accounts.filter((a: any) => a.account_type === "expense")
    const expenseAccountIds = expenseAccounts.map((a: any) => a.id)
    
    const expenseEntries = glEntries.filter((e: any) => 
      expenseAccountIds.includes(e.account_id) && Number(e.debit_amount) > 0
    )
    const totalExpenses = expenseEntries.reduce((sum: number, e: any) => sum + Number(e.debit_amount || 0), 0)

    // Calculate by category
    const expensesByCategory: Record<string, number> = {}
    expenseEntries.forEach((e: any) => {
      const account = accounts.find((a: any) => a.id === e.account_id)
      if (account) {
        const category = account.account_code.substring(0, 2) // e.g., "51" for Salaries
        expensesByCategory[category] = (expensesByCategory[category] || 0) + Number(e.debit_amount || 0)
      }
    })

    const netProfit = totalRevenue - totalExpenses

    return {
      totalRevenue,
      feeRevenue,
      otherIncomeTotal,
      totalExpenses,
      expensesByCategory,
      netProfit,
      revenueAccounts,
      expenseAccounts,
    }
  }

  // Calculate Balance Sheet
  const calculateBalanceSheet = () => {
    const assets: Record<string, number> = {}
    const liabilities: Record<string, number> = {}
    const equity: Record<string, number> = {}

    trialBalance.forEach((tb: any) => {
      const account = accounts.find((a: any) => a.id === tb.account_id)
      if (!account) return

      const balance = Number(tb.debit_total) - Number(tb.credit_total)
      const accountCode = parseInt(account.account_code)

      if (account.account_type === "asset") {
        if (accountCode >= 1000 && accountCode < 1100) {
          assets["Cash"] = (assets["Cash"] || 0) + balance
        } else if (accountCode >= 1100 && accountCode < 1200) {
          assets["Bank Accounts"] = (assets["Bank Accounts"] || 0) + balance
        } else if (accountCode >= 1200 && accountCode < 1300) {
          assets["Accounts Receivable"] = (assets["Accounts Receivable"] || 0) + balance
        } else {
          assets[account.account_name] = (assets[account.account_name] || 0) + balance
        }
      } else if (account.account_type === "liability") {
        liabilities[account.account_name] = (liabilities[account.account_name] || 0) + balance
      } else if (account.account_type === "equity") {
        equity[account.account_name] = (equity[account.account_name] || 0) + balance
      }
    })

    // Calculate retained earnings (net profit)
    const pl = calculatePL()
    equity["Retained Earnings"] = (equity["Retained Earnings"] || 0) + pl.netProfit

    const totalAssets = Object.values(assets).reduce((sum, val) => sum + val, 0)
    const totalLiabilities = Object.values(liabilities).reduce((sum, val) => sum + val, 0)
    const totalEquity = Object.values(equity).reduce((sum, val) => sum + val, 0)

    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
    }
  }

  // Calculate Cash Flow
  const calculateCashFlow = () => {
    // Operating Activities
    const operatingInflows = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
    const operatingOutflows = expenses
      .filter((e: any) => e.payment_status === "paid")
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0)
    const operatingCashFlow = operatingInflows - operatingOutflows

    // Get cash and bank accounts from GL
    const cashAccounts = accounts.filter((a: any) => 
      parseInt(a.account_code) >= 1000 && parseInt(a.account_code) < 1200
    )
    const cashAccountIds = cashAccounts.map((a: any) => a.id)
    const cashEntries = glEntries.filter((e: any) => cashAccountIds.includes(e.account_id))
    
    const cashInflows = cashEntries
      .filter((e: any) => Number(e.debit_amount) > 0)
      .reduce((sum: number, e: any) => sum + Number(e.debit_amount || 0), 0)
    
    const cashOutflows = cashEntries
      .filter((e: any) => Number(e.credit_amount) > 0)
      .reduce((sum: number, e: any) => sum + Number(e.credit_amount || 0), 0)

    const netCashFlow = cashInflows - cashOutflows

    return {
      operatingInflows,
      operatingOutflows,
      operatingCashFlow,
      cashInflows,
      cashOutflows,
      netCashFlow,
    }
  }

  const pl = calculatePL()
  const balanceSheet = calculateBalanceSheet()
  const cashFlow = calculateCashFlow()

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>Report Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={localReportType} onValueChange={handleReportChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pl">Profit & Loss</SelectItem>
                  <SelectItem value="bs">Balance Sheet</SelectItem>
                  <SelectItem value="cf">Cash Flow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={localStartDate}
                onChange={(e) => setLocalStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={localEndDate}
                onChange={(e) => setLocalEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={handleDateChange} className="w-full">
                Update Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profit & Loss Statement */}
      {localReportType === "pl" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Profit & Loss Statement</CardTitle>
            <CardDescription>
              {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Revenue Section */}
              <div>
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl mb-3">
                  <h3 className="text-lg font-semibold">Revenue</h3>
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    KES {pl.totalRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-2 ml-4">
                  {/* Fee Revenue - PRIMARY */}
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <div>
                      <span className="text-neutral-500 font-medium">Fee Revenue (PRIMARY)</span>
                      <Badge variant="outline" className="ml-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
                        PRIMARY
                      </Badge>
                    </div>
                    <span className="font-medium">KES {pl.feeRevenue.toLocaleString()}</span>
                  </div>
                  {/* Other Income - SECONDARY */}
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <div>
                      <span className="text-neutral-500">Other Income (SECONDARY)</span>
                      <Badge variant="outline" className="ml-2 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300">
                        SECONDARY
                      </Badge>
                    </div>
                    <span className="font-medium">KES {pl.otherIncomeTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Expenses Section */}
              <div>
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 rounded-xl mb-3">
                  <h3 className="text-lg font-semibold">Expenses</h3>
                  <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                    KES {pl.totalExpenses.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-2 ml-4">
                  {Object.entries(pl.expensesByCategory).map(([category, amount]) => {
                    const account = pl.expenseAccounts.find((a: any) => a.account_code.startsWith(category))
                    return (
                      <div key={category} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-neutral-500">{account?.account_name || `Category ${category}`}</span>
                        <span className="font-medium">KES {Number(amount).toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Net Income */}
              <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                <h3 className="text-xl font-bold">Net Income</h3>
                <span className={`text-3xl font-bold ${pl.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  KES {pl.netProfit.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance Sheet */}
      {localReportType === "bs" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Balance Sheet</CardTitle>
            <CardDescription>As of {new Date(endDate).toLocaleDateString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Assets */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Assets</h3>
                <div className="space-y-2">
                  {Object.entries(balanceSheet.assets).map(([name, amount]) => (
                    <div key={name} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-neutral-500">{name}</span>
                      <span className="font-medium">KES {Number(amount).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2 border-t-2 border-gray-300 dark:border-gray-700 mt-2 pt-2">
                    <span className="font-semibold">Total Assets</span>
                    <span className="font-bold text-lg">KES {balanceSheet.totalAssets.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Liabilities & Equity */}
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Liabilities</h3>
                  <div className="space-y-2">
                    {Object.entries(balanceSheet.liabilities).map(([name, amount]) => (
                      <div key={name} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-neutral-500">{name}</span>
                        <span className="font-medium">KES {Number(amount).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 border-t-2 border-gray-300 dark:border-gray-700 mt-2 pt-2">
                      <span className="font-semibold">Total Liabilities</span>
                      <span className="font-bold text-lg">KES {balanceSheet.totalLiabilities.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Equity</h3>
                  <div className="space-y-2">
                    {Object.entries(balanceSheet.equity).map(([name, amount]) => (
                      <div key={name} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-neutral-500">{name}</span>
                        <span className="font-medium">KES {Number(amount).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 border-t-2 border-gray-300 dark:border-gray-700 mt-2 pt-2">
                      <span className="font-semibold">Total Equity</span>
                      <span className="font-bold text-lg">KES {balanceSheet.totalEquity.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between py-4 border-t-4 border-gray-400 dark:border-gray-600 mt-4 pt-4">
                  <span className="font-bold text-xl">Total Liabilities & Equity</span>
                  <span className="font-bold text-xl">KES {(balanceSheet.totalLiabilities + balanceSheet.totalEquity).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cash Flow Statement */}
      {localReportType === "cf" && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Cash Flow Statement</CardTitle>
            <CardDescription>
              {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Operating Activities */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Operating Activities</h3>
                <div className="space-y-2 ml-4">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-neutral-500">Fee Collections (PRIMARY)</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      +KES {cashFlow.operatingInflows.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-neutral-500">Expenses Paid</span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      -KES {cashFlow.operatingOutflows.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-4 border-t-2 border-gray-300 dark:border-gray-700 mt-2 pt-2">
                    <span className="font-semibold">Net Cash from Operations</span>
                    <span className={`font-bold text-lg ${cashFlow.operatingCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      KES {cashFlow.operatingCashFlow.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Cash Flow */}
              <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                <h3 className="text-xl font-bold">Net Cash Flow</h3>
                <span className={`text-3xl font-bold ${cashFlow.netCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  KES {cashFlow.netCashFlow.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

