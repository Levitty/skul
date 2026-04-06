"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { UserPlus, Search, Users, Shield, BookOpen, Calculator, ChevronLeft, ChevronRight } from "lucide-react"

interface UserWithProfile {
  id: string
  user_id: string
  role: string
  branch_id: string | null
  created_at: string
  full_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  branch_name?: string | null
}

interface Branch {
  id: string
  name: string
}

interface UsersPageClientProps {
  users: UserWithProfile[]
  branches: Branch[]
  schoolId: string
}

const ITEMS_PER_PAGE = 10

// Role color mapping - Finflow inspired
const getRoleBadgeStyles = (role: string) => {
  const roleMap: Record<
    string,
    { bg: string; text: string; bgHover: string; dot: string }
  > = {
    school_admin: {
      bg: "bg-indigo-50",
      text: "text-indigo-700",
      bgHover: "hover:bg-indigo-100",
      dot: "bg-indigo-500",
    },
    super_admin: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      bgHover: "hover:bg-purple-100",
      dot: "bg-purple-500",
    },
    teacher: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      bgHover: "hover:bg-blue-100",
      dot: "bg-blue-500",
    },
    accountant: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      bgHover: "hover:bg-emerald-100",
      dot: "bg-emerald-500",
    },
    branch_admin: {
      bg: "bg-violet-50",
      text: "text-violet-700",
      bgHover: "hover:bg-violet-100",
      dot: "bg-violet-500",
    },
    staff: {
      bg: "bg-cyan-50",
      text: "text-cyan-700",
      bgHover: "hover:bg-cyan-100",
      dot: "bg-cyan-500",
    },
  }

  return (
    roleMap[role] || {
      bg: "bg-neutral-50",
      text: "text-neutral-700",
      bgHover: "hover:bg-neutral-100",
      dot: "bg-neutral-500",
    }
  )
}

// Format role display name
const formatRoleName = (role: string): string => {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

// Format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Get initials for avatar
const getInitials = (fullName: string | null, email: string | null): string => {
  if (fullName) {
    return fullName
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }
  if (email) {
    return email.charAt(0).toUpperCase()
  }
  return "?"
}

// Get avatar background color based on role
const getAvatarColor = (role: string): string => {
  const roleColorMap: Record<string, string> = {
    school_admin: "from-indigo-500 to-indigo-600",
    super_admin: "from-purple-500 to-purple-600",
    teacher: "from-blue-500 to-cyan-600",
    accountant: "from-emerald-500 to-teal-600",
    branch_admin: "from-violet-500 to-purple-600",
    staff: "from-cyan-500 to-blue-600",
  }

  return roleColorMap[role] || "from-neutral-400 to-neutral-500"
}

// Stat card component - Finflow inspired
const StatCard = ({
  label,
  value,
  dotColor,
}: {
  label: string
  value: string | number
  dotColor: string
}) => (
  <div
    className="rounded-xl border border-neutral-200/60 bg-white p-4"
    style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
          {label}
        </p>
        <p className="text-xl font-bold text-neutral-900 tabular-nums">{value}</p>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
    </div>
  </div>
)

export function UsersPageClient({
  users,
  branches,
  schoolId,
}: UsersPageClientProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [branchFilter, setBranchFilter] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  // Filter users based on search and filters
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        !searchQuery ||
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.phone?.includes(searchQuery)

      const matchesRole = !roleFilter || user.role === roleFilter

      const matchesBranch = !branchFilter || user.branch_id === branchFilter

      return matchesSearch && matchesRole && matchesBranch
    })
  }, [users, searchQuery, roleFilter, branchFilter])

  // Calculate pagination
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleFilterChange = (callback: () => void) => {
    callback()
    setCurrentPage(1)
  }

  // Calculate stats
  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "school_admin" || u.role === "super_admin").length,
    teachers: users.filter((u) => u.role === "teacher").length,
    others: users.filter(
      (u) => !["school_admin", "super_admin", "teacher"].includes(u.role)
    ).length,
  }

  // Get unique roles from users
  const uniqueRoles = Array.from(
    new Set(users.map((u) => u.role))
  ).sort()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight mb-2">
              Users & Staff
            </h1>
            <p className="text-sm text-neutral-500">
              Manage school users, assign roles, and oversee staff access
            </p>
          </div>
          <Link href="/dashboard/admin/users/invite">
            <Button className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
              <UserPlus className="w-4 h-4" />
              Invite User
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Row - Finflow inspired */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Total Users" value={stats.total} dotColor="bg-blue-500" />
        <StatCard
          label="Admins"
          value={stats.admins}
          dotColor="bg-indigo-500"
        />
        <StatCard
          label="Teachers"
          value={stats.teachers}
          dotColor="bg-blue-500"
        />
        <StatCard
          label="Other Staff"
          value={stats.others}
          dotColor="bg-emerald-500"
        />
      </div>

      {/* Filter Bar */}
      <div
        className="rounded-xl border border-neutral-200/60 bg-white p-5 mb-6"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
      >
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) =>
                handleFilterChange(() => setSearchQuery(e.target.value))
              }
              className="w-full pl-10 pr-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) =>
              handleFilterChange(() => setRoleFilter(e.target.value))
            }
            className="px-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent appearance-none bg-white cursor-pointer"
          >
            <option value="">All Roles</option>
            {uniqueRoles.map((role) => (
              <option key={role} value={role}>
                {formatRoleName(role)}
              </option>
            ))}
          </select>

          {/* Branch Filter */}
          <select
            value={branchFilter}
            onChange={(e) =>
              handleFilterChange(() => setBranchFilter(e.target.value))
            }
            className="px-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent appearance-none bg-white cursor-pointer"
          >
            <option value="">All Branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div
        className="rounded-xl border border-neutral-200/60 bg-white overflow-hidden"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
      >
        {paginatedUsers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 mx-auto text-neutral-300 mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-1">
              No users found
            </h3>
            <p className="text-sm text-neutral-500">
              {filteredUsers.length === 0 && users.length > 0
                ? "Try adjusting your filters"
                : "No users have been added to this school yet"}
            </p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-neutral-100 bg-neutral-50">
              <div className="col-span-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Name
              </div>
              <div className="col-span-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Email
              </div>
              <div className="col-span-1 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Role
              </div>
              <div className="col-span-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Branch
              </div>
              <div className="col-span-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Joined
              </div>
              <div className="col-span-2 text-xs font-medium text-neutral-500 uppercase tracking-wider text-right">
                Actions
              </div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-neutral-100">
              {paginatedUsers.map((user) => {
                const roleStyles = getRoleBadgeStyles(user.role)
                const avatarColor = getAvatarColor(user.role)
                const initials = getInitials(user.full_name, user.email)

                return (
                  <div
                    key={user.id}
                    className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-neutral-50/50 transition-colors"
                  >
                    {/* Name + Avatar */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg bg-gradient-to-br ${avatarColor} flex items-center justify-center text-sm font-medium text-white flex-shrink-0`}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">
                          {user.full_name || "Unnamed User"}
                        </p>
                        {user.phone && (
                          <p className="text-xs text-neutral-500 truncate">
                            {user.phone}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    <div className="col-span-2">
                      <p className="text-sm text-neutral-600 truncate">
                        {user.email || "-"}
                      </p>
                    </div>

                    {/* Role Badge */}
                    <div className="col-span-1">
                      <div
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium ${roleStyles.bg} ${roleStyles.text}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${roleStyles.dot}`} />
                        {formatRoleName(user.role)}
                      </div>
                    </div>

                    {/* Branch */}
                    <div className="col-span-2">
                      <p className="text-sm text-neutral-600">
                        {user.branch_name || "All Branches"}
                      </p>
                    </div>

                    {/* Joined Date */}
                    <div className="col-span-2">
                      <p className="text-sm text-neutral-500">
                        {formatDate(user.created_at)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="col-span-2 text-right">
                      <Link
                        href={`/dashboard/admin/users/${user.user_id}/edit`}
                        className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50">
                <p className="text-sm text-neutral-600">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredUsers.length)} of{" "}
                  {filteredUsers.length} users
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setCurrentPage(Math.max(1, currentPage - 1))
                    }
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                            currentPage === page
                              ? "bg-emerald-100 text-emerald-700"
                              : "text-neutral-600 hover:bg-neutral-100"
                          }`}
                        >
                          {page}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
