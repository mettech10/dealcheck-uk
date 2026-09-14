/**
 * Section 8 verification for /tools/* — pinned regression cases.
 *
 * Test 1 — SDLT calculator at £350k investment.
 *   Expected: £125k × 5% + £125k × 7% + £100k × 10% = £25,000
 *
 * Tests 2 + 3 (Portfolio Tracker, Deal Comparison) exercise auth-gated
 * Supabase paths and are best verified live in Chrome — see the run
 * summary printed by this script for the manual checklist.
 *
 * Run: npx tsx scripts/verify-tools.ts
 */

import { calculateSDLT } from "../lib/calculations.ts"
import { comparePersonalVsLtd, DEFAULT_LTD_CO_INPUT } from "../lib/ltdCoCompare.ts"

const banner = (s: string) =>
  console.log("\n" + "═".repeat(72) + "\n  " + s + "\n" + "═".repeat(72))

banner("TEST 1 — SDLT Calculator (£350k Investment, Apr-2025 bands)")
const r = calculateSDLT(350_000, "additional", "residential")
const expected = 25_000

console.log("Bands hit:")
for (const line of r.breakdown) {
  console.log("  • £" + line.band + ": £" + line.tax.toLocaleString())
}
console.log(`Total SDLT:        £${r.total.toLocaleString()}`)
console.log(`Effective rate:    ${((r.total / 350_000) * 100).toFixed(2)}%`)
console.log(`Expected:          £${expected.toLocaleString()}`)

const pass = r.total === expected
console.log(pass ? "\n  ✓ PASS" : "\n  ✗ FAIL — math drift")

banner("MANUAL CHECKLIST — Tests 2 + 3 (auth-gated, run in browser)")
console.log(`
Test 2 — /tools/portfolio
  1. Sign in
  2. Click "+ Add Property"
  3. Tab 1: nickname "Manchester BTL", address "14 Acacia Avenue, M14",
            postcode M14 5AA, type Terraced, beds 3, strategy BTL,
            purchase £155,000, purchase date 2022-01-15
  4. Tab 2: current value £185,000, outstanding mortgage £116,250,
            rate 5.5%, type interest_only, monthly rent £875
  5. Tab 3: monthly mortgage auto-fills £533, monthly expenses £147
  6. Save → confirm card shows:
       Value £185,000 · Equity £68,750 · LTV 62.8%
       Monthly cashflow £195 · Gross yield 5.68%

Test 3 — /tools/compare
  1. Ensure 2 saved analyses exist
  2. Open /tools/compare
  3. Select both deals via the dropdowns
  4. Click "Compare These Deals →"
  5. Verify side-by-side table renders all rows
  6. Verify per-metric winner highlights (teal text)
  7. If either deal has Article 4, banner appears in verdict card
  8. Free tier: third slot locked with "Pro feature · Upgrade" pill
  9. Pro tier: third slot is a real dropdown + "Save as PDF" button

Test 4 — /tools/compliance (England, 1–20 units)
  1. Sign in
  2. Navbar Tools → Compliance Cockpit
  3. Unauthenticated users see the sign-in gate
  4. With portfolio properties, dashboard shows traffic lights keyed by propertyId
  5. Open a property file → seven rows (GAS, EICR, EPC, DEP, HTR, LIC_HMO, LIC_SEL)
  6. Log a GAS expiry in the future → light turns green/amber
  7. Calendar tab lists the expiry + reminder offsets from Settings
  8. Disclaimer “not legal advice” is visible on dashboard and property file
  9. Catalogue tab lists the seven codes and explicitly excludes MTD / Screener / Ltd Co / full licensing

Cap reached (Free → 4th property):
  1. With 3 properties already added on Free, click "+ Add Property"
  2. Modal opens, fill in, click Save
  3. Modal closes; amber upgrade banner appears above the property list:
       "Free limit reached — Pro unlocks unlimited portfolio tracking"
       with "Upgrade to Pro" CTA → /account
`)

banner("TEST 4 — Personal vs Ltd Co (test-only engine; live UI uses Flask BE)")

const ltd = comparePersonalVsLtd({
  ...DEFAULT_LTD_CO_INPUT,
  deal: {
    annualGrossRent: 24_000,
    annualOperatingCosts: 4_000,
    annualFinanceCosts: 8_000,
    rentGrowthPercent: 0,
    costGrowthPercent: 0,
    financeGrowthPercent: 0,
    purchasePrice: 250_000,
  },
  personal: { otherTaxableIncome: 60_000, region: "england-ni" },
  company: {
    associatedCompanies: 0,
    annualAccountancyCost: 1_500,
    otherCompanyProfits: 0,
    setupCostYear1: 0,
  },
  horizon: { years: 10, discountRatePercent: 5 },
})
const y1Personal = ltd.personal.year1AfterTax
const y1Ltd = ltd.retained.year1AfterTax
console.log(`Year-1 personal after-tax: £${y1Personal.toLocaleString()}`)
console.log(`Year-1 Ltd retained:       £${y1Ltd.toLocaleString()}`)
console.log(`Lean (retained):           ${ltd.retained.lean}`)
console.log(`Disclaimer educational:    ${ltd.flags.educationalOnly}`)
const leanPass =
  y1Personal === 5_600 &&
  y1Ltd === 8_505 &&
  !ltd.retained.copy.toLowerCase().includes("incorporate now")
console.log(leanPass ? "\n  ✓ PASS" : "\n  ✗ FAIL — Ltd Co compare drift")
