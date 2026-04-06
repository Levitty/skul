"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useState } from "react"
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardCheck,
  Calendar,
  FileText,
  DollarSign,
  Bus,
  BookOpen,
  PenTool,
  Megaphone,
  CalendarDays,
  FileCheck,
  BarChart3,
  Settings,
  Home,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ShoppingBag,
  Package,
  ShoppingCart,
  History,
  MessageCircle,
  Receipt,
  FolderTree,
  Heart,
  Shield,
  Trophy,
  UserCog,
  KeyRound
} from "lucide-react"
import { BranchSelector } from "./branch-selector"

// Navigation item types
type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  roles: string[]
}

type NavGroup = {
  label: string
  icon: React.ReactNode
  roles: string[]
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isNavGroup(item: NavEntry): item is NavGroup {
  return 'children' in item
}

const navItems: NavEntry[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin", "super_admin", "accountant", "librarian", "nurse", "store_keeper", "transport_manager"]
  },
  {
    href: "/dashboard/teacher",
    label: "My Dashboard",
    icon: <LayoutDashboard className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["teacher"]
  },
  {
    label: "My Teaching",
    icon: <BookOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["teacher"],
    children: [
      { href: "/dashboard/teacher/my-classes", label: "My Classes", icon: <Users className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/teacher/grades/enter", label: "Enter Grades", icon: <PenTool className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/teacher/student-progress", label: "Student Progress", icon: <BarChart3 className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/teacher/attendance", label: "Mark Attendance", icon: <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
    ],
  },
  {
    label: "Students",
    icon: <Users className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin"],
    children: [
      { href: "/dashboard/admin/students", label: "All Students", icon: <Users className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/teacher/attendance", label: "Attendance", icon: <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
    ],
  },
  {
    label: "Admissions",
    icon: <UserPlus className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin"],
    children: [
      { href: "/dashboard/admin/admissions", label: "Applications", icon: <FileText className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/admissions/new", label: "New Application", icon: <UserPlus className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
    ],
  },
  {
    href: "/dashboard/admin/timetable",
    label: "Timetable",
    icon: <Calendar className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin"]
  },
  {
    href: "/dashboard/teacher/grades",
    label: "Grades",
    icon: <FileText className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin"]
  },
  {
    label: "Accounting",
    icon: <DollarSign className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["accountant", "school_admin", "branch_admin"],
    children: [
      { href: "/dashboard/accountant/finance", label: "Finance Dashboard", icon: <BarChart3 className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin", "branch_admin"] },
      { href: "/dashboard/accountant/fees", label: "Fees & Invoices", icon: <FileText className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin", "branch_admin"] },
      { href: "/dashboard/accountant/finance/credit-notes", label: "Credit Notes", icon: <FileText className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin", "branch_admin"] },
      { href: "/dashboard/accountant/finance/journal-entries", label: "Journal Entries", icon: <FileText className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin"] },
      { href: "/dashboard/accountant/finance/suppliers", label: "Suppliers", icon: <Users className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin"] },
      { href: "/dashboard/admin/financials", label: "Financial Reports", icon: <FileCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin"] },
    ]
  },
  {
    label: "Expense Management",
    icon: <Receipt className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["accountant", "school_admin", "branch_admin"],
    children: [
      { href: "/dashboard/accountant/finance/expenses", label: "Expenses", icon: <Receipt className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin", "branch_admin"] },
      { href: "/dashboard/accountant/finance/expenses/categories", label: "Expense Categories", icon: <FolderTree className="w-4 h-4" strokeWidth={1.5} />, roles: ["accountant", "school_admin", "branch_admin"] },
    ]
  },
  {
    label: "Store",
    icon: <ShoppingBag className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["store_keeper", "accountant", "school_admin", "branch_admin"],
    children: [
      { href: "/dashboard/store/inventory", label: "Inventory", icon: <Package className="w-4 h-4" strokeWidth={1.5} />, roles: ["store_keeper", "accountant", "school_admin", "branch_admin"] },
      { href: "/dashboard/store/sales", label: "New Sale", icon: <ShoppingCart className="w-4 h-4" strokeWidth={1.5} />, roles: ["store_keeper", "accountant", "school_admin", "branch_admin"] },
      { href: "/dashboard/store/sales/history", label: "Sales History", icon: <History className="w-4 h-4" strokeWidth={1.5} />, roles: ["store_keeper", "accountant", "school_admin", "branch_admin"] },
    ]
  },
  {
    label: "Transport",
    icon: <Bus className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin", "transport_manager"],
    children: [
      { href: "/dashboard/admin/transport", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin", "transport_manager"] },
      { href: "/dashboard/admin/transport/routes", label: "Routes & Stops", icon: <Bus className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin", "transport_manager"] },
      { href: "/dashboard/admin/transport/vehicles", label: "Vehicles", icon: <Bus className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin", "transport_manager"] },
      { href: "/dashboard/admin/transport/drivers", label: "Drivers", icon: <Users className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin", "transport_manager"] },
      { href: "/dashboard/admin/transport/assignments", label: "Assignments", icon: <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin", "transport_manager"] },
    ]
  },
  {
    href: "/dashboard/admin/activities",
    label: "Activities",
    icon: <Trophy className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin"]
  },
  {
    label: "Academic",
    icon: <BookOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "branch_admin"],
    children: [
      { href: "/dashboard/admin/academic/subjects", label: "Subjects", icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/academic/class-assignments", label: "Class Assignments", icon: <Users className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/academic/schemes", label: "Schemes of Work", icon: <FileText className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/academic/lesson-plans", label: "Lesson Plans", icon: <PenTool className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/academic/exams", label: "Exams & Report Cards", icon: <FileCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/noticeboard", label: "Noticeboard", icon: <Megaphone className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/events", label: "Events", icon: <CalendarDays className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
      { href: "/dashboard/admin/student-leaves", label: "Student Leaves", icon: <FileCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
    ]
  },
  {
    label: "Classwork",
    icon: <PenTool className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["teacher"],
    children: [
      { href: "/dashboard/teacher/homework", label: "Homework", icon: <PenTool className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/teacher/assignments", label: "Assignments", icon: <FileCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/teacher/quizzes", label: "Quizzes", icon: <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/teacher/schemes", label: "My Schemes", icon: <FileText className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/teacher/study-materials", label: "Study Materials", icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
      { href: "/dashboard/admin/academic/lesson-plans", label: "Lesson Plans", icon: <PenTool className="w-4 h-4" strokeWidth={1.5} />, roles: ["teacher"] },
    ]
  },
  { href: "/dashboard/admin/library", label: "Library", icon: <BookOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin", "librarian"] },
  { href: "/dashboard/admin/health", label: "Health / Clinic", icon: <Heart className="w-[18px] h-[18px]" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin", "nurse"] },
  { href: "/dashboard/admin/discipline", label: "Discipline", icon: <Shield className="w-[18px] h-[18px]" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
  { href: "/dashboard/admin/communications", label: "Communications", icon: <MessageCircle className="w-[18px] h-[18px]" strokeWidth={1.5} />, roles: ["school_admin", "branch_admin"] },
  { href: "/dashboard/admin/strategic", label: "Analytics", icon: <BarChart3 className="w-[18px] h-[18px]" strokeWidth={1.5} />, roles: ["school_admin", "super_admin"] },
  {
    label: "User Management",
    icon: <UserCog className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "super_admin"],
    children: [
      { href: "/dashboard/admin/users", label: "All Users", icon: <Users className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "super_admin"] },
      { href: "/dashboard/admin/users/invite", label: "Invite User", icon: <UserPlus className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "super_admin"] },
      { href: "/dashboard/admin/roles", label: "Roles & Permissions", icon: <KeyRound className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "super_admin"] },
    ]
  },
  {
    label: "Settings",
    icon: <Settings className="w-[18px] h-[18px]" strokeWidth={1.5} />,
    roles: ["school_admin", "super_admin"],
    children: [
      { href: "/dashboard/admin/school-setup", label: "School Setup", icon: <Settings className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin"] },
      { href: "/dashboard/admin/diagnostics", label: "Diagnostics", icon: <BarChart3 className="w-4 h-4" strokeWidth={1.5} />, roles: ["school_admin", "super_admin"] },
    ]
  },
  { href: "/dashboard/admin/whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-[18px] h-[18px]" strokeWidth={1.5} />, roles: ["school_admin", "super_admin"] },
  { href: "/dashboard/parent/dashboard", label: "Parent Portal", icon: <Home className="w-[18px] h-[18px]" strokeWidth={1.5} />, roles: ["parent", "school_admin"] },
]

export function DashboardNav({ userRole = "school_admin" }: { userRole?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  // Build href that preserves the branch param
  const branchParam = searchParams.get("branch")
  const withBranch = (href: string) => {
    if (!branchParam) return href
    return `${href}?branch=${branchParam}`
  }

  const hasAccess = (roles: string[]) => {
    if (roles.includes("all")) return true
    return roles.includes(userRole)
  }

  const filteredNavItems = navItems
    .filter(item => hasAccess(item.roles))
    .map(item => {
      if (isNavGroup(item)) {
        const filteredChildren = item.children.filter(child => hasAccess(child.roles))
        if (filteredChildren.length === 0) return null
        return { ...item, children: filteredChildren }
      }
      return item
    })
    .filter(Boolean) as NavEntry[]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev =>
      prev.includes(label)
        ? prev.filter(g => g !== label)
        : [...prev, label]
    )
  }

  const isGroupActive = (group: NavGroup) => {
    return group.children.some(child => pathname.startsWith(child.href))
  }

  const renderNavItem = (item: NavItem, isChild = false) => {
    const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))

    return (
      <Link
        key={item.href}
        href={withBranch(item.href)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150",
          isChild && "ml-7 text-[13px]",
          isActive
            ? "bg-emerald-50 text-emerald-800 font-medium"
            : "text-neutral-500 hover:text-neutral-900 hover:bg-emerald-50/40"
        )}
      >
        {!isChild && (
          <span className={cn(
            "flex-shrink-0",
            isActive ? "text-emerald-600" : "text-neutral-400"
          )}>
            {item.icon}
          </span>
        )}
        <span className="truncate">{item.label}</span>
      </Link>
    )
  }

  const renderNavGroup = (group: NavGroup) => {
    const isExpanded = expandedGroups.includes(group.label)
    const isActive = isGroupActive(group)

    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group.label)}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] transition-colors duration-150",
            isActive
              ? "text-emerald-800 font-medium"
              : "text-neutral-500 hover:text-neutral-900 hover:bg-emerald-50/40"
          )}
        >
          <span className={cn(
            "flex-shrink-0",
            isActive ? "text-emerald-600" : "text-neutral-400"
          )}>
            {group.icon}
          </span>
          <span className="flex-1 text-left truncate">{group.label}</span>
          <ChevronDown className={cn(
            "w-3.5 h-3.5 text-neutral-400 transition-transform duration-200",
            isExpanded && "rotate-180"
          )} />
        </button>

        {isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {group.children.map(child => renderNavItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className="h-screen w-[240px] flex flex-col border-r border-neutral-200 bg-white flex-shrink-0">
      {/* Header */}
      <div className="px-5 py-5 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <span className="text-white text-sm font-bold">T</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-neutral-900 leading-tight">Tuta Educators</h1>
          </div>
        </div>
      </div>

      {/* Branch Selector */}
      <div className="pt-3">
        <BranchSelector />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {filteredNavItems.map((item) =>
          isNavGroup(item) ? renderNavGroup(item) : renderNavItem(item)
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-neutral-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors duration-150"
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={1.5} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  )
}
