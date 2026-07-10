/**
 * Picks the 4 metrics shown on the shareable deal card, per strategy,
 * from the app's real result types (CalculationResults + PropertyFormData)
 * — not a loose bag of ad-hoc field names.
 *
 * Privacy: getAreaLabel never returns the full address — city + postcode
 * district only (e.g. "Manchester, M14").
 */

import type { CalculationResults, PropertyFormData } from "@/lib/types"
import type { CardMetric } from "@/components/analyse/deal-share-card"

const fmtSigned = (n: number) =>
  n >= 0
    ? `+£${Math.round(n).toLocaleString("en-GB")}`
    : `-£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`

const fmtPct = (n: number) => `${n.toFixed(1)}%`

const fmtK = (n: number) =>
  n >= 1000
    ? `£${(n / 1000).toFixed(0)}k`
    : `£${Math.round(n).toLocaleString("en-GB")}`

/** Display label for the card's strategy badge. */
export function getStrategyLabel(investmentType: string): string {
  const MAP: Record<string, string> = {
    btl: "BTL",
    hmo: "HMO",
    brr: "BRRRR",
    flip: "Flip",
    r2sa: "SA",
    development: "Development",
  }
  return MAP[investmentType] ?? investmentType.toUpperCase()
}

export function getCardMetrics(
  data: PropertyFormData,
  results: CalculationResults,
): CardMetric[] {
  switch (data.investmentType) {
    case "hmo":
      return [
        {
          label: "HMO Gross Yield",
          value: fmtPct(results.grossYield),
          isPositive: results.grossYield >= 10,
        },
        {
          label: "Monthly Cashflow",
          value: fmtSigned(results.monthlyCashFlow),
          isPositive: results.monthlyCashFlow >= 0,
        },
        {
          label: "Rooms",
          value: data.roomCount ? `${data.roomCount} rooms` : "—",
        },
        {
          label: "Gross Monthly Rent",
          value: fmtK(data.monthlyRent),
        },
      ]

    case "brr":
      return [
        {
          label: "Capital Recycled",
          value:
            results.brrrrCapitalRecycledPct != null
              ? `${Math.round(results.brrrrCapitalRecycledPct)}%`
              : "—",
          isPositive: (results.brrrrCapitalRecycledPct ?? 0) >= 70,
        },
        {
          label: "Money Left In",
          value:
            results.moneyLeftInDeal != null
              ? results.moneyLeftInDeal <= 0
                ? "£0 (recycled)"
                : fmtK(results.moneyLeftInDeal)
              : "—",
          isPositive: (results.moneyLeftInDeal ?? Infinity) <= 15000,
        },
        {
          label: "Monthly Cashflow",
          value: fmtSigned(results.monthlyCashFlow),
          isPositive: results.monthlyCashFlow >= 0,
        },
        {
          label: "Equity Gained",
          value:
            results.equityGained != null ? fmtK(results.equityGained) : "—",
          isPositive: (results.equityGained ?? 0) > 0,
        },
      ]

    case "flip":
      return [
        {
          label: "Net Profit",
          value: fmtK(results.flipNetProfit ?? 0),
          isPositive: (results.flipNetProfit ?? 0) > 0,
        },
        {
          label: "Flip ROI",
          value: fmtPct(results.flipROI ?? 0),
          isPositive: (results.flipROI ?? 0) >= 15,
        },
        {
          label: "ARV",
          value: data.arv ? fmtK(data.arv) : "—",
        },
        {
          label: "Total Capital",
          value: fmtK(results.totalCapitalRequired),
        },
      ]

    case "r2sa":
      return [
        {
          label: "Monthly Revenue",
          value: fmtK(results.monthlyIncome),
        },
        {
          label: "Monthly Profit",
          value: fmtSigned(results.monthlyCashFlow),
          isPositive: results.monthlyCashFlow >= 0,
        },
        {
          label: "Occupancy",
          value: data.saOccupancyRate != null ? `${data.saOccupancyRate}%` : "—",
        },
        {
          label: "Nightly Rate",
          value: data.saNightlyRate != null ? `£${data.saNightlyRate}/night` : "—",
        },
      ]

    case "development": {
      const dev = results.development
      return [
        {
          label: "GDV",
          value: dev?.totalGDV != null ? fmtK(dev.totalGDV) : "—",
        },
        {
          label: "Profit on Cost",
          value: dev?.profitOnCost != null ? fmtPct(dev.profitOnCost) : "—",
          isPositive: (dev?.profitOnCost ?? 0) >= 20,
        },
        {
          label: "Total Dev Cost",
          value:
            dev?.totalDevelopmentCost != null
              ? fmtK(dev.totalDevelopmentCost)
              : "—",
        },
        {
          label: "Gross Profit",
          value: dev?.grossProfit != null ? fmtK(dev.grossProfit) : "—",
          isPositive: (dev?.grossProfit ?? 0) > 0,
        },
      ]
    }

    // BTL + anything new falls through to the classic quartet
    default:
      return [
        {
          label: "Gross Yield",
          value: fmtPct(results.grossYield),
          isPositive: results.grossYield >= 5,
        },
        {
          label: "Monthly Cashflow",
          value: fmtSigned(results.monthlyCashFlow),
          isPositive: results.monthlyCashFlow >= 0,
        },
        {
          label: "Purchase Price",
          value: fmtK(data.purchasePrice),
        },
        {
          label: "Net Yield",
          value: fmtPct(results.netYield),
          isPositive: results.netYield >= 3,
        },
      ]
  }
}

/**
 * Area label for the card — postcode district + city only, NEVER the
 * full address. "14 Cardigan Road, Headingley, Leeds" + "LS6 3AA"
 * → "Leeds, LS6".
 */
export function getAreaLabel(address: string, postcode: string): string {
  const district = (postcode || "").trim().split(/\s+/)[0]?.toUpperCase() ?? ""

  // Last address part that isn't a postcode fragment or house-number-ish
  // token — usually the town/city.
  const city = (address || "")
    .split(",")
    .map((p) => p.trim())
    .reverse()
    .find(
      (p) =>
        p.length > 2 &&
        !/^[A-Z]{1,2}[0-9][0-9A-Z]?(\s*[0-9][A-Z]{2})?$/i.test(p) &&
        !/\d/.test(p.split(/\s+/)[0] ?? ""),
    )

  if (city && district) return `${city}, ${district}`
  if (district) return district
  if (city) return city
  return "UK Property"
}
