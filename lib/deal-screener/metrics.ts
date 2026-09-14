/**
 * Screener metrics — deliberately NOT the analyser engine.
 *
 * Gross yield is the industry-standard asking-price / annual-rent ratio.
 * Simple cashflow is rent minus interest-only mortgage on a fixed LTV/rate.
 * No SDLT, voids, management, maintenance, or refurb — those live in
 * lib/calculations.ts and must not be imported here.
 */

export const SIMPLE_CASHFLOW_LTV = 0.75
export const SIMPLE_CASHFLOW_ANNUAL_RATE = 0.05

export interface SimpleMetricsInput {
  price: number
  monthlyRent: number | null | undefined
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Gross yield % = (monthlyRent × 12) / price × 100.
 * Returns null when rent or price is missing / non-positive — the
 * screener never invents a rent.
 */
export function simpleGrossYield(
  price: number,
  monthlyRent: number | null | undefined,
): number | null {
  if (!(price > 0) || monthlyRent == null || !(monthlyRent > 0)) return null
  return round2(((monthlyRent * 12) / price) * 100)
}

/**
 * Simple monthly cashflow = rent − (price × 75% LTV × 5% / 12).
 * Interest-only heuristic for a fast screen, not a mortgage quote.
 */
export function simpleMonthlyCashflow(
  price: number,
  monthlyRent: number | null | undefined,
): number | null {
  if (monthlyRent == null || !(monthlyRent > 0)) return null
  if (!(price > 0)) return round2(monthlyRent)
  const monthlyInterest =
    (price * SIMPLE_CASHFLOW_LTV * SIMPLE_CASHFLOW_ANNUAL_RATE) / 12
  return round2(monthlyRent - monthlyInterest)
}

export function computeScreenMetrics(input: SimpleMetricsInput) {
  return {
    grossYield: simpleGrossYield(input.price, input.monthlyRent),
    simpleCashflow: simpleMonthlyCashflow(input.price, input.monthlyRent),
  }
}
