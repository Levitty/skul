"use client"

import { useBranchContext } from "./branch-context"
import { Building2, ChevronDown, MapPin, Check, Plus } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

export function BranchSelector() {
  const {
    branches,
    selectedBranchId,
    selectedBranch,
    setSelectedBranch,
    hasAllBranchesAccess,
    userBranchId,
  } = useBranchContext()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // If no branches exist AND user is admin, show setup prompt
  if (branches.length === 0 && hasAllBranchesAccess) {
    return (
      <div className="mx-3 mb-3">
        <button
          onClick={() => router.push("/dashboard/admin/school-setup/branches")}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] uppercase tracking-wider text-emerald-600/70 font-semibold leading-none mb-0.5">
              Branches
            </p>
            <p className="text-[13px] font-medium text-emerald-700 truncate leading-tight">
              Set up branches
            </p>
          </div>
        </button>
      </div>
    )
  }

  // If no branches and not admin, hide completely
  if (branches.length === 0) return null

  // If user is branch-scoped (not admin), show a read-only badge
  if (!hasAllBranchesAccess) {
    const myBranch = branches.find((b) => b.id === userBranchId)
    if (!myBranch) return null
    return (
      <div className="mx-3 mb-3">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-emerald-600/70 font-semibold leading-none mb-0.5">
              Your Branch
            </p>
            <p className="text-[13px] font-medium text-emerald-900 truncate leading-tight">
              {myBranch.name}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Admin view: interactive branch switcher dropdown
  const displayLabel =
    selectedBranchId === "all" ? "All Branches" : selectedBranch?.name || "Select Branch"

  return (
    <div className="mx-3 mb-3" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-200",
          open
            ? "bg-emerald-50 border-emerald-200 shadow-sm"
            : "bg-white border-neutral-200/80 hover:border-emerald-200 hover:bg-emerald-50/30"
        )}
      >
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
            selectedBranchId === "all"
              ? "bg-gradient-to-br from-emerald-100 to-teal-100"
              : "bg-emerald-100"
          )}
        >
          <Building2 className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold leading-none mb-0.5">
            Branch
          </p>
          <p className="text-[13px] font-medium text-neutral-800 truncate leading-tight">
            {displayLabel}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 flex-shrink-0",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="mt-1.5 rounded-xl border border-neutral-200 bg-white shadow-lg shadow-black/[0.06] overflow-hidden z-50 relative">
          {/* All Branches option */}
          <button
            onClick={() => {
              setSelectedBranch("all")
              setOpen(false)
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
              selectedBranchId === "all"
                ? "bg-emerald-50"
                : "hover:bg-neutral-50"
            )}
          >
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-3 h-3 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-neutral-800 truncate">
                All Branches
              </p>
              <p className="text-[11px] text-neutral-400 leading-tight">
                View data across all locations
              </p>
            </div>
            {selectedBranchId === "all" && (
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            )}
          </button>

          {/* Divider */}
          <div className="border-t border-neutral-100" />

          {/* Branch list */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => {
                  setSelectedBranch(branch.id)
                  setOpen(false)
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  selectedBranchId === branch.id
                    ? "bg-emerald-50"
                    : "hover:bg-neutral-50"
                )}
              >
                <div className="w-6 h-6 rounded-md bg-neutral-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-3 h-3 text-neutral-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-neutral-800 truncate">
                    {branch.name}
                  </p>
                  {branch.address && (
                    <p className="text-[11px] text-neutral-400 truncate leading-tight">
                      {branch.address}
                    </p>
                  )}
                </div>
                {selectedBranchId === branch.id && (
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
