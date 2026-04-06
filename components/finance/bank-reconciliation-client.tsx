"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { matchBankTransaction } from "@/lib/actions/bank-reconciliation"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface BankReconciliationClientProps {
  bankAccounts: any[]
  selectedAccountId: string | null
  transactions: any[]
  unmatchedPayments: any[]
}

export function BankReconciliationClient({
  bankAccounts,
  selectedAccountId,
  transactions,
  unmatchedPayments,
}: BankReconciliationClientProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [matchingId, setMatchingId] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<string>("")

  const handleMatch = async (transactionId: string, matchType: "payment" | "expense" | "other_income", matchId: string) => {
    try {
      await matchBankTransaction(transactionId, matchType, matchId)
      
      toast({
        title: "Success",
        description: "Transaction matched successfully",
      })

      router.refresh()
      setMatchingId(null)
      setSelectedPayment("")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to match transaction",
        variant: "destructive",
      })
    }
  }

  const handleAccountChange = (accountId: string) => {
    router.push(`/dashboard/accountant/finance/bank-reconciliation?accountId=${accountId}`)
  }

  return (
    <div className="space-y-6">
      {bankAccounts.length > 0 && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Select Bank Account</CardTitle>
              <Select
                value={selectedAccountId || ""}
                onValueChange={handleAccountChange}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account: any) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </Card>
      )}

      {selectedAccountId && (
        <>
          {/* Unmatched Payments */}
          {unmatchedPayments.length > 0 && (
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <CardTitle>Unmatched Payments</CardTitle>
                <CardDescription>Fee payments that haven&apos;t been matched to bank transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {unmatchedPayments.slice(0, 10).map((payment: any) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div>
                        <p className="font-medium">
                          {payment.invoices?.students?.first_name} {payment.invoices?.students?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {payment.invoices?.reference} • {payment.method} • {new Date(payment.paid_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                          KES {Number(payment.amount).toLocaleString()}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setMatchingId(`payment-${payment.id}`)
                            setSelectedPayment(payment.id)
                          }}
                        >
                          Match
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bank Transactions */}
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>Bank Transactions</CardTitle>
              <CardDescription>Match transactions with payments and expenses</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No unreconciled transactions</p>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction: any) => {
                    const isDeposit = transaction.transaction_type === "deposit"
                    const matchId = `${transaction.transaction_type}-${transaction.id}`

                    return (
                      <div key={transaction.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold">{transaction.description}</p>
                              <span className={`text-xs px-2 py-1 rounded ${
                                isDeposit
                                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                                  : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                              }`}>
                                {transaction.transaction_type}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {new Date(transaction.transaction_date).toLocaleDateString()}
                              {transaction.reference_number && ` • Ref: ${transaction.reference_number}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold ${isDeposit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {isDeposit ? "+" : "-"}KES {Number(transaction.amount).toLocaleString()}
                            </p>
                            {transaction.balance_after && (
                              <p className="text-xs text-muted-foreground">
                                Balance: KES {Number(transaction.balance_after).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>

                        {matchingId === matchId && isDeposit && unmatchedPayments.length > 0 && (
                          <div className="mt-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                            <p className="text-sm font-medium mb-2">Match with payment:</p>
                            <Select
                              value={selectedPayment}
                              onValueChange={setSelectedPayment}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select payment" />
                              </SelectTrigger>
                              <SelectContent>
                                {unmatchedPayments.map((payment: any) => (
                                  <SelectItem key={payment.id} value={payment.id}>
                                    {payment.invoices?.reference} - KES {Number(payment.amount).toLocaleString()} - {new Date(payment.paid_at).toLocaleDateString()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                onClick={() => selectedPayment && handleMatch(transaction.id, "payment", selectedPayment)}
                                disabled={!selectedPayment}
                              >
                                Match
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setMatchingId(null)
                                  setSelectedPayment("")
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {!matchingId && !transaction.is_reconciled && (
                          <div className="flex gap-2 mt-3">
                            {isDeposit && unmatchedPayments.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setMatchingId(matchId)}
                              >
                                Match Payment
                              </Button>
                            )}
                            {transaction.matched_payment_id && (
                              <span className="text-xs text-muted-foreground">
                                Matched with payment
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

