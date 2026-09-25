import { afterEach, describe, expect, test } from "vitest"
import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  formatCreditsLabel,
  isNavItemActive,
  visiblePrimaryNav,
} from "@/lib/app-nav"

const hrefs = [...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => item.href)

describe("tools rail routes", () => {
  const previous = process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1

  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1
    else process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1 = previous
  })

  test("primary tools use the live routes, not the mockup aliases", () => {
    expect(hrefs).toContain("/analyse")
    expect(hrefs).toContain("/discovery")
    expect(hrefs).toContain("/tools/compliance")
    expect(hrefs).toContain("/tools/licensing-checker")
    expect(hrefs).toContain("/mtd")
    expect(hrefs).toContain("/tools/personal-vs-ltd")
    expect(hrefs).not.toContain("/tools/licensing")
    expect(hrefs).not.toContain("/tools/mtd-pack")
    expect(hrefs).not.toContain("/tools/mtd")
    // Deal Screener is a Chrome extension. /screener/connect is not a tool page.
    expect(hrefs).not.toContain("/screener/connect")
    expect(hrefs.some((href) => href.includes("screener"))).toBe(false)
  })

  test("hides Licensing Checker when the feature flag is off", () => {
    process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1 = "false"
    expect(
      visiblePrimaryNav().some((item) => item.href === "/tools/licensing-checker"),
    ).toBe(false)
    delete process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1
    expect(
      visiblePrimaryNav().some((item) => item.href === "/tools/licensing-checker"),
    ).toBe(true)
  })

  test("active state follows the current pathname, including nested results", () => {
    const analyser = PRIMARY_NAV[0]
    expect(isNavItemActive("/analyse", analyser)).toBe(true)
    expect(isNavItemActive("/analyse/results", analyser)).toBe(true)
    expect(isNavItemActive("/discovery", analyser)).toBe(false)

    const compliance = PRIMARY_NAV.find((item) => item.href === "/tools/compliance")!
    expect(isNavItemActive("/tools/compliance", compliance)).toBe(true)
    expect(isNavItemActive("/tools/compliance/prop-1", compliance)).toBe(true)
    expect(isNavItemActive("/tools/compare", compliance)).toBe(false)

    const mtd = PRIMARY_NAV.find((item) => item.href === "/mtd")!
    expect(isNavItemActive("/mtd", mtd)).toBe(true)
    expect(isNavItemActive("/mtd/ledger", mtd)).toBe(true)
    expect(isNavItemActive("/mtd/pack", mtd)).toBe(true)
    expect(isNavItemActive("/mtd/share/abc", mtd)).toBe(true)

    const portfolio = SECONDARY_NAV.find((item) => item.href === "/tools/portfolio")!
    expect(isNavItemActive("/tools/portfolio", portfolio)).toBe(true)
    expect(isNavItemActive("/portfolio", portfolio)).toBe(true)
    expect(isNavItemActive("/tools/personal-vs-ltd", portfolio)).toBe(false)
  })
})

describe("formatCreditsLabel", () => {
  test("omits the block without a signed-in balance", () => {
    expect(formatCreditsLabel(null)).toBeNull()
    expect(
      formatCreditsLabel({
        authenticated: false,
        isUnlimited: false,
        creditBalance: 3,
        freeUsed: 0,
        freeLimit: 3,
      }),
    ).toBeNull()
  })

  test("folds free allowance and paid credits into one remaining count", () => {
    expect(
      formatCreditsLabel({
        authenticated: true,
        isUnlimited: false,
        creditBalance: 2,
        freeUsed: 1,
        freeLimit: 3,
      }),
    ).toBe("4 left")
    expect(
      formatCreditsLabel({
        authenticated: true,
        isUnlimited: false,
        creditBalance: 0,
        freeUsed: 3,
        freeLimit: 3,
      }),
    ).toBe("0 left")
  })

  test("unlimited plans do not show a fabricated count", () => {
    expect(
      formatCreditsLabel({
        authenticated: true,
        isUnlimited: true,
        creditBalance: 0,
        freeUsed: 0,
        freeLimit: 3,
      }),
    ).toBe("Unlimited")
  })
})
