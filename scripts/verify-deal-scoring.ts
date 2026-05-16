/**
 * Section 11 — Deal-scoring engine verification.
 *
 * 4 pinned test cases prove the hard caps and the rubric behave per
 * the user's spec. Engine output is asserted against expected ranges,
 * and full breakdown printed for visual inspection.
 *
 * Run: npx tsx scripts/verify-deal-scoring.ts
 */

import { scoreDeal, type ScoringInput } from "../lib/dealScoring.ts"

const banner = (s: string) =>
  console.log("\n" + "═".repeat(72) + "\n  " + s + "\n" + "═".repeat(72))

type Expectation = {
  name: string
  input: ScoringInput
  expect: {
    maxScore?: number
    minScore?: number
    mustIncludeWarning?: string
    mustIncludeFlagType?: string
  }
}

const cases: Expectation[] = [
  // ── TEST 1 — HMO with Article 4 + great financials ──
  // Configured so raw pre-cap score would hit 80+; cap to 70 then fires
  // a "Score capped — Article 4 active" warning per spec.
  {
    name: "HMO with Article 4 active — exceptional otherwise",
    input: {
      strategy: "hmo",
      grossYield: 17,
      netYield: 12,
      monthlyCashflow: 850,
      cashOnCashRoi: 14,
      totalCapitalRequired: 55000,
      purchasePrice: 200000,
      sdlt: 11000,
      mortgageLtv: 65,
      tenure: "freehold",
      bedrooms: 5,
      condition: "good",
      numberOfRooms: 5,
      article4Status: "active",
      hmoRoomDemand: "high",
      avgRoomRentMarket: 600,
      userRentPerRoom: 700,
      avgSoldPriceArea: 240000,    // purchase 17% BMV
      soldComparablesCount: 8,
      rentalComparablesCount: 10,
      areaGrossYieldMedian: 7,
    },
    expect: {
      maxScore: 70,
      mustIncludeWarning: "Article 4 active",
      mustIncludeFlagType: "article4_hmo",
    },
  },

  // ── TEST 2 — BTL with 65-year lease ──
  {
    name: "BTL with 65-year leasehold remaining",
    input: {
      strategy: "btl",
      grossYield: 7,
      netYield: 5,
      monthlyCashflow: 250,
      cashOnCashRoi: 6,
      totalCapitalRequired: 55000,
      purchasePrice: 180000,
      sdlt: 9200,
      mortgageLtv: 75,
      tenure: "leasehold",
      leaseYearsRemaining: 65,
      bedrooms: 2,
      condition: "good",
      article4Status: "none",
      avgSoldPriceArea: 175000,
      soldComparablesCount: 6,
      rentalComparablesCount: 6,
      areaPriceGrowth5yr: 3.5,
      areaGrossYieldMedian: 6.2,
    },
    expect: {
      maxScore: 50,
      mustIncludeWarning: "Lease under 70 years",
      mustIncludeFlagType: "short_lease",
    },
  },

  // ── TEST 3 — SA with 90% user occupancy vs 45% market ──
  {
    name: "SA Owned with optimistic 90% occupancy (market 45%)",
    input: {
      strategy: "r2sa",
      grossYield: 14,
      netYield: 8,
      monthlyCashflow: 950,
      cashOnCashRoi: 18,
      totalCapitalRequired: 60000,
      purchasePrice: 200000,
      sdlt: 11000,
      mortgageLtv: 70,
      tenure: "freehold",
      bedrooms: 2,
      condition: "good",
      article4Status: "none",
      ownershipType: "own",
      monthlyNetProfit: 950,
      revenueToCostsRatio: 2.1,
      airroiOccupancyAvg: 45,
      userOccupancyRate: 90,
      airroiNightlyRate: 110,
      userNightlyRate: 115,
      activeListingsArea: 250,
      breakEvenOccupancy: 38,
      platformFeePct: 15,
      capitalPaybackMonths: 6,
      saArticle4Risk: "none",
    },
    expect: {
      maxScore: 60,
      mustIncludeWarning: "Occupancy assumption",
      mustIncludeFlagType: "sa_occupancy_risk",
    },
  },

  // ── TEST 4 — Good BTL: BMV, 7.5% yield, freehold, no A4 ──
  {
    name: "Good BTL: 15% BMV, 7.5% yield, freehold, no A4",
    input: {
      strategy: "btl",
      grossYield: 7.5,
      netYield: 5.5,
      monthlyCashflow: 250,
      cashOnCashRoi: 6.5,
      totalCapitalRequired: 50000,
      purchasePrice: 170000,
      sdlt: 7800,
      mortgageLtv: 70,
      tenure: "freehold",
      bedrooms: 3,
      condition: "good",
      article4Status: "none",
      avgSoldPriceArea: 200000,   // purchase 15% below
      soldComparablesCount: 12,
      rentalComparablesCount: 12,
      areaVoidRate: 2.5,
      areaPriceGrowth5yr: 4,
      areaGrossYieldMedian: 6,
      nationalYieldMedian: 5.5,
    },
    expect: {
      minScore: 70,
    },
  },
]

let pass = 0
let fail = 0

for (const c of cases) {
  banner(c.name)
  const r = scoreDeal(c.input)
  console.log(
    `Total: ${r.total}/100 · ${r.label} · colour=${r.colour}`,
  )
  if (r.warnings.length) {
    console.log("Warnings:")
    r.warnings.forEach((w) => console.log("  •", w))
  }
  if (r.criticalFlags.length) {
    console.log("Critical flags:")
    r.criticalFlags.forEach((f) => console.log("  •", f.type, "—", f.message))
  }
  console.log("Categories:")
  for (const cat of r.categories) {
    console.log(`  ${cat.name}: ${cat.score}/${cat.maxScore}`)
    for (const f of cat.factors) {
      console.log(`    • ${f.name} (${f.value}): ${f.score}/${f.maxScore}`)
    }
  }

  const failures: string[] = []
  if (c.expect.maxScore !== undefined && r.total > c.expect.maxScore) {
    failures.push(
      `Score ${r.total} exceeds expected max ${c.expect.maxScore}`,
    )
  }
  if (c.expect.minScore !== undefined && r.total < c.expect.minScore) {
    failures.push(
      `Score ${r.total} below expected min ${c.expect.minScore}`,
    )
  }
  if (c.expect.mustIncludeWarning) {
    const found = r.warnings.some((w) =>
      w.toLowerCase().includes(c.expect.mustIncludeWarning!.toLowerCase()),
    )
    if (!found) {
      failures.push(
        `Expected warning containing "${c.expect.mustIncludeWarning}"`,
      )
    }
  }
  if (c.expect.mustIncludeFlagType) {
    const found = r.criticalFlags.some(
      (f) => f.type === c.expect.mustIncludeFlagType,
    )
    if (!found) {
      failures.push(
        `Expected criticalFlag type "${c.expect.mustIncludeFlagType}"`,
      )
    }
  }

  if (failures.length === 0) {
    console.log("\n  ✓ PASS")
    pass++
  } else {
    console.log("\n  ✗ FAIL")
    failures.forEach((f) => console.log("    -", f))
    fail++
  }
}

console.log("\n" + "═".repeat(72))
console.log(`  ${pass}/${pass + fail} tests passed`)
console.log("═".repeat(72) + "\n")

if (fail > 0) process.exit(1)
