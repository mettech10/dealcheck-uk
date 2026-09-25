import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"

export interface ToolItem {
  href: string
  name: string
}

/** Desktop + mobile Tools menu. Canonical MTD Pack route is `/mtd`. */
export function toolsMenuItems(
  licensingEnabled = isLicensingCheckerEnabled(),
): ToolItem[] {
  return [
    { href: "/discovery", name: "Deal Discovery" },
    { href: "/tools/sdlt-calculator", name: "SDLT Calculator" },
    { href: "/tools/personal-vs-ltd", name: "Personal vs Ltd Co" },
    { href: "/tools/portfolio", name: "Portfolio Tracker" },
    { href: "/tools/compare", name: "Deal Comparison" },
    { href: "/tools/compliance", name: "Compliance Cockpit" },
    ...(licensingEnabled
      ? [{ href: "/tools/licensing-checker", name: "Licensing Checker" }]
      : []),
    { href: "/mtd", name: "MTD Pack" },
  ]
}
