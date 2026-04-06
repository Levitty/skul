import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BankAccountForm } from "@/components/finance/bank-account-form"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function NewBankAccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    redirect("/login")
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
            Add Bank Account
          </h1>
          <p className="text-lg text-muted-foreground">
            Register a new bank account for tracking
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/accountant/finance/banking">Back</Link>
        </Button>
      </div>

      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>Bank Account Details</CardTitle>
          <CardDescription>Enter the bank account information</CardDescription>
        </CardHeader>
        <CardContent>
          <BankAccountForm />
        </CardContent>
      </Card>
    </div>
  )
}



