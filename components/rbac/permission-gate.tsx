"use client"

import { useEffect, useState, ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"

interface PermissionGateProps {
  resource: string
  action: string
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Client component to conditionally render content based on user permissions
 * Note: For server components, use the checkPermission function from lib/rbac/check-permission.ts
 */
export function PermissionGate({
  resource,
  action,
  children,
  fallback = null,
}: PermissionGateProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkPermission() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setHasPermission(false)
          setLoading(false)
          return
        }

        // Get user's role
        const { data: userSchool, error: userSchoolError } = await supabase
          .from("user_schools")
          .select("role, custom_role_id")
          .eq("user_id", user.id)
          .single()

        if (userSchoolError || !userSchool) {
          setHasPermission(false)
          setLoading(false)
          return
        }

        const userSchoolData = userSchool as any

        // Super admin and school admin always have permission
        if (userSchoolData.role === "super_admin" || userSchoolData.role === "school_admin") {
          setHasPermission(true)
          setLoading(false)
          return
        }

        // Check custom role permissions
        if (userSchoolData.custom_role_id) {
          const { data: rolePermissions, error: rolePermError } = await supabase
            .from("role_permissions")
            .select("permissions(resource, action)")
            .eq("role_id", userSchoolData.custom_role_id)

          const rolePermList = rolePermissions || []
          const hasMatch = rolePermList.some(
            (rp: any) =>
              rp.permissions?.resource === resource && rp.permissions?.action === action
          )

          setHasPermission(!!hasMatch)
        } else {
          setHasPermission(false)
        }
      } catch (error) {
        console.error("[PermissionGate] Error:", error)
        setHasPermission(false)
      } finally {
        setLoading(false)
      }
    }

    checkPermission()
  }, [resource, action])

  if (loading) {
    return null // Or a loading spinner
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>
}

