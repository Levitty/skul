"use client"

import { createContext, useContext, useState, useCallback, ReactNode } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"

interface Branch {
  id: string
  name: string
  address?: string | null
}

interface BranchContextValue {
  branches: Branch[]
  selectedBranchId: string // "all" or a branch UUID
  selectedBranch: Branch | null
  setSelectedBranch: (branchId: string) => void
  hasAllBranchesAccess: boolean
  userBranchId: string | null
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function useBranchContext() {
  const ctx = useContext(BranchContext)
  if (!ctx) {
    throw new Error("useBranchContext must be used within a BranchProvider")
  }
  return ctx
}

// Safe version that returns null instead of throwing
export function useBranchContextSafe() {
  return useContext(BranchContext)
}

interface BranchProviderProps {
  children: ReactNode
  branches: Branch[]
  userBranchId: string | null
  hasAllBranchesAccess: boolean
}

export function BranchProvider({
  children,
  branches,
  userBranchId,
  hasAllBranchesAccess,
}: BranchProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const initialBranch = searchParams.get("branch") || (hasAllBranchesAccess ? "all" : userBranchId || "all")
  const [selectedBranchId, setSelectedBranchIdState] = useState(initialBranch)

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) || null

  const setSelectedBranch = useCallback(
    (branchId: string) => {
      setSelectedBranchIdState(branchId)

      // Sync to URL
      const params = new URLSearchParams(searchParams.toString())
      if (branchId === "all") {
        params.delete("branch")
      } else {
        params.set("branch", branchId)
      }
      const qs = params.toString()
      router.push(pathname + (qs ? `?${qs}` : ""), { scroll: false })
    },
    [router, pathname, searchParams]
  )

  return (
    <BranchContext.Provider
      value={{
        branches,
        selectedBranchId,
        selectedBranch,
        setSelectedBranch,
        hasAllBranchesAccess,
        userBranchId,
      }}
    >
      {children}
    </BranchContext.Provider>
  )
}
