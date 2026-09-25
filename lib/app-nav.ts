/**
 * Signed-in tools rail.
 *
 * Labels follow the platform sidebar mockup. Hrefs are the live routes
 * in this app — several mockup paths do not exist:
 *   - Licensing Checker is /tools/licensing-checker (not /tools/licensing)
 *   - MTD Pack is /mtd (/tools/mtd permanently redirects there;
 *     /tools/mtd-pack does not exist)
 *   - Ltd Co Calculator is /tools/personal-vs-ltd
 *   - Deal Screener has no in-app page. It is a closed-beta Chrome
 *     extension; the only web route is /screener/connect, which errors
 *     unless the extension opened it. It is omitted from the rail.
 */

import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"

export interface AppNavItem {
  href: string
  label: string
  /** Pathname prefixes that mark this item active. */
  match: readonly string[]
}

export const PRIMARY_NAV: readonly AppNavItem[] = [
  { href: "/analyse", label: "Deal Analyser", match: ["/analyse"] },
  { href: "/discovery", label: "Deal Discovery", match: ["/discovery"] },
  {
    href: "/tools/compliance",
    label: "Compliance Cockpit",
    match: ["/tools/compliance"],
  },
  {
    href: "/tools/licensing-checker",
    label: "Licensing Checker",
    match: ["/tools/licensing-checker"],
  },
  { href: "/mtd", label: "MTD Pack", match: ["/mtd"] },
  {
    href: "/tools/personal-vs-ltd",
    label: "Ltd Co Calculator",
    match: ["/tools/personal-vs-ltd"],
  },
]

/** Existing tool pages that are not in the seven-item mockup list. */
export const SECONDARY_NAV: readonly AppNavItem[] = [
  {
    href: "/tools/sdlt-calculator",
    label: "SDLT Calculator",
    match: ["/tools/sdlt-calculator"],
  },
  {
    href: "/tools/portfolio",
    label: "Portfolio Tracker",
    match: ["/tools/portfolio", "/portfolio"],
  },
  {
    href: "/tools/compare",
    label: "Deal Comparison",
    match: ["/tools/compare", "/compare"],
  },
  {
    href: "/article4-map",
    label: "Article 4 Map",
    match: ["/article4-map"],
  },
]

export function visiblePrimaryNav(): AppNavItem[] {
  return PRIMARY_NAV.filter((item) =>
    item.href === "/tools/licensing-checker" ? isLicensingCheckerEnabled() : true,
  )
}

export function isNavItemActive(pathname: string, item: AppNavItem): boolean {
  return item.match.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export interface CreditLabelInput {
  authenticated: boolean
  isUnlimited: boolean
  creditBalance: number
  freeUsed: number
  freeLimit: number
}

/**
 * Sidebar credits line. Returns null when we do not have a signed-in
 * balance — callers must omit the block rather than show a placeholder.
 * Unlimited plans have no remaining count. Everyone else sees free
 * allowance plus paid credits, the same pool the header pill uses.
 */
export function formatCreditsLabel(
  state: CreditLabelInput | null | undefined,
): string | null {
  if (!state || state.authenticated !== true) return null
  if (state.isUnlimited) return "Unlimited"
  const freeLeft = Math.max(0, state.freeLimit - state.freeUsed)
  const total = freeLeft + Math.max(0, state.creditBalance)
  return `${total} left`
}
