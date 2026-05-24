"use client"

/**
 * Admin sidebar — 7 nav items + admin pill + sign-out.
 *
 * Visual spec (per 2026-05-24 brief):
 *   - bg #1A1D2E, right border #2A2D3E
 *   - active item: teal left border, teal text, teal/10 background
 *   - hover: teal/10 background, teal text
 *   - admin pill at bottom: teal initial circle, name + "Administrator"
 *   - sign-out: red text, red/10 hover
 *
 * Reads the active pathname to highlight the current item. Renders
 * client-side because next/navigation's usePathname is a client hook.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  BarChart3,
  Users,
  CreditCard,
  AlertTriangle,
  Activity,
  Server,
  LogOut,
} from "lucide-react"
import { signOut } from "@/app/auth/actions"

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Per-item badge — e.g. unresolved-errors count. */
  badgeCount?: number
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/errors", label: "Errors", icon: AlertTriangle },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/system", label: "System", icon: Server },
]

export function AdminSidebar({
  adminName,
  adminEmail,
  unresolvedErrorCount,
}: {
  adminName: string
  adminEmail: string
  unresolvedErrorCount?: number
}) {
  const pathname = usePathname()
  const initial = (adminName || adminEmail || "?").charAt(0).toUpperCase()

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-[#2A2D3E] bg-[#1A1D2E]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-[#2A2D3E] px-6 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[#00BFA5]/15">
          <LayoutDashboard className="size-4 text-[#00BFA5]" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-white">Metalyzi</span>
          <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
            Admin Dashboard
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href)
            const Icon = item.icon
            const badge =
              item.label === "Errors" && unresolvedErrorCount && unresolvedErrorCount > 0
                ? unresolvedErrorCount
                : undefined
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-[#00BFA5]/10 text-[#00BFA5]"
                      : "text-[#9CA3AF] hover:bg-[#00BFA5]/10 hover:text-[#00BFA5]"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-r bg-[#00BFA5]"
                    />
                  )}
                  <Icon className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  {badge !== undefined && (
                    <span className="inline-flex items-center justify-center rounded-full bg-[#EF4444]/20 px-2 py-0.5 text-[10px] font-semibold text-[#EF4444]">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Admin pill + sign-out */}
      <div className="border-t border-[#2A2D3E] p-4">
        <div className="mb-3 flex items-center gap-3 rounded-md bg-black/20 px-3 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#00BFA5] text-sm font-semibold text-[#0F1117]">
            {initial}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-medium text-white">
              {adminName || adminEmail}
            </p>
            <p className="truncate text-[10px] text-[#9CA3AF]">Administrator</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-[#EF4444] transition-colors hover:bg-[#EF4444]/10"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}

/** Active when exact match OR the current path is a sub-route of href. */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (pathname === href) return true
  if (href === "/admin") return false // exact-only so it doesn't swallow children
  return pathname.startsWith(href + "/")
}
