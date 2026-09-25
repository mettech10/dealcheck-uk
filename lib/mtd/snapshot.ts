import { SA105_CATEGORIES } from "./categories"
import type { FlaskPackSnapshot } from "./types"

export function incomeExpenseFromTotals(totals: Record<string, number> | undefined) {
  let income = 0
  let expenses = 0
  for (const c of SA105_CATEGORIES) {
    const n = totals?.[c.code] || 0
    if (c.kind === "income") income += n
    else if (c.kind === "expense") expenses += n
  }
  return { income, expenses, net: income - expenses }
}

export function propertyNetFromEntries(
  entries: Array<{ categoryCode: string; amountPence: number }>,
) {
  const totals: Record<string, number> = {}
  for (const entry of entries) {
    totals[entry.categoryCode] = (totals[entry.categoryCode] || 0) + entry.amountPence
  }
  return incomeExpenseFromTotals(totals)
}

export function snapshotCategoryRows(snapshot?: FlaskPackSnapshot) {
  const totals = snapshot?.periodTotalsPence || {}
  return SA105_CATEGORIES.map((c) => ({
    code: c.code,
    name: c.name,
    kind: c.kind,
    sa105Box: c.sa105Box,
    isResidentialFinance: c.isResidentialFinance,
    periodPence: totals[c.code] || 0,
  })).filter((row) => row.periodPence !== 0)
}

