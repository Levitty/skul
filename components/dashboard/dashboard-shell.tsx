"use client"

import { ReactNode } from "react"
import { DashboardNav } from "@/components/dashboard/nav"
import { IntelligenceBot } from "@/components/dashboard/intelligence-bot"
import { BranchProvider } from "@/components/dashboard/branch-context"
import { AuthProvider, useAuth } from "@/components/dashboard/auth-provider"

function DashboardContent({ children }: { children: ReactNode }) {
  const { userRole, branches, userBranchId, hasAllBranchesAccess, loading } = useAuth()

  if (loading) {
    return (
      <div
        className="flex min-h-screen"
        style={{
          background: "linear-gradient(135deg, #f8faf9 0%, #f0f7f4 100%)",
        }}
      >
        <div className="h-screen w-[240px] flex-shrink-0 border-r border-neutral-200 bg-white" />
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="max-w-[1200px] mx-auto">
            <div className="space-y-6 animate-pulse">
              <div className="flex items-center justify-between">
                <div>
                  <div className="h-7 w-48 bg-neutral-200 rounded-lg" />
                  <div className="h-4 w-72 bg-neutral-100 rounded-lg mt-2" />
                </div>
              </div>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-neutral-200 bg-white p-5">
                    <div className="h-4 w-24 bg-neutral-100 rounded" />
                    <div className="h-8 w-16 bg-neutral-200 rounded mt-3" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <BranchProvider
      branches={branches}
      userBranchId={userBranchId}
      hasAllBranchesAccess={hasAllBranchesAccess}
    >
      <div
        className="flex min-h-screen"
        style={{
          background: "linear-gradient(135deg, #f8faf9 0%, #f0f7f4 100%)",
        }}
      >
        <DashboardNav userRole={userRole} />
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="max-w-[1200px] mx-auto">{children}</div>
        </main>
        <IntelligenceBot />
      </div>
    </BranchProvider>
  )
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  )
}
