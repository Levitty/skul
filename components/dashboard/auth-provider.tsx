"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface AuthContextValue {
  user: any | null
  userRole: string
  userBranchId: string | null
  schoolId: string | null
  branches: { id: string; name: string; address: string | null }[]
  hasAllBranchesAccess: boolean
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userRole: "teacher",
  userBranchId: null,
  schoolId: null,
  branches: [],
  hasAllBranchesAccess: false,
  loading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<AuthContextValue>({
    user: null,
    userRole: "teacher",
    userBranchId: null,
    schoolId: null,
    branches: [],
    hasAllBranchesAccess: false,
    loading: true,
  })

  useEffect(() => {
    let mounted = true

    async function loadUserData() {
      const supabase = await createClient()

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const [{ data: userSchool }] = await Promise.all([
        supabase
          .from("user_schools")
          .select("role, branch_id, school_id")
          .eq("user_id", user.id)
          .single(),
      ])

      const us = userSchool as any
      const userRole = us?.role || "teacher"
      const userBranchId = us?.branch_id || null
      const schoolId = us?.school_id || null

      const hasAllBranchesAccess =
        userRole === "super_admin" ||
        userRole === "school_admin" ||
        !userBranchId

      let branches: { id: string; name: string; address: string | null }[] = []
      if (schoolId) {
        const { data: branchData } = await supabase
          .from("school_branches")
          .select("id, name, address")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("name", { ascending: true })

        branches = (branchData as any[]) || []
      }

      if (mounted) {
        setState({
          user,
          userRole,
          userBranchId,
          schoolId,
          branches,
          hasAllBranchesAccess,
          loading: false,
        })
      }
    }

    loadUserData()

    return () => { mounted = false }
  }, [router])

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  )
}
