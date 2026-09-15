"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/mtd", label: "Overview", exact: true },
  { href: "/mtd/ledger", label: "Ledger" },
  { href: "/mtd/pack", label: "Quarterly pack" },
  { href: "/mtd/share", label: "Accountant" },
]

export function MtdSubnav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="MTD Pack"
      className="flex flex-wrap gap-1 rounded-lg border border-border/50 bg-muted/40 p-1"
    >
      {ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname?.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
