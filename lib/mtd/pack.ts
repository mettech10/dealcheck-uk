import { MTD_DISCLAIMER } from "./disclaimer"
import { getCategory, SA105_CATEGORIES } from "./categories"
import { roundPence } from "./money"
import type {
  CategoryTotals,
  MtdLedgerEntry,
  MtdPack,
  MtdProperty,
  MtdQuarterId,
  PropertyPackSlice,
} from "./types"
import { quarterPeriod, toIsoDate } from "./taxYear"

function emptyTotals(): CategoryTotals[] {
  return SA105_CATEGORIES.map((c) => ({
    categoryId: c.id,
    label: c.label,
    kind: c.kind,
    sa105Box: c.sa105Box,
    count: 0,
    total: 0,
  }))
}

function applyEntry(buckets: CategoryTotals[], entry: MtdLedgerEntry) {
  const row = buckets.find((b) => b.categoryId === entry.category_id)
  if (!row) return
  row.count += 1
  row.total = roundPence(row.total + Number(entry.amount))
}

function summarise(buckets: CategoryTotals[]) {
  let income = 0
  let expenses = 0
  let allowances = 0
  let adjustments = 0
  let entryCount = 0
  for (const b of buckets) {
    entryCount += b.count
    if (b.kind === "income") income += b.total
    else if (b.kind === "expense") expenses += b.total
    else if (b.kind === "allowance") allowances += b.total
    else adjustments += b.total
  }
  return {
    income: roundPence(income),
    expenses: roundPence(expenses),
    allowances: roundPence(allowances),
    adjustments: roundPence(adjustments),
    netWorkingPapers: roundPence(income - expenses + adjustments - allowances),
    entryCount,
  }
}

export function buildPack(opts: {
  taxYear: string
  quarter: MtdQuarterId
  entries: MtdLedgerEntry[]
  properties: MtdProperty[]
  generatedAt?: Date
}): MtdPack {
  const period = quarterPeriod(opts.taxYear, opts.quarter)
  if (!period) {
    throw new Error(`Invalid tax year / quarter: ${opts.taxYear} ${opts.quarter}`)
  }

  const inPeriod = opts.entries.filter((e) => {
    const d = e.entry_date.slice(0, 10)
    return d >= toIsoDate(period.start) && d <= toIsoDate(period.end)
  })

  const byCategory = emptyTotals()
  for (const e of inPeriod) applyEntry(byCategory, e)

  const byProperty: PropertyPackSlice[] = opts.properties.map((p) => {
    const buckets = emptyTotals()
    const rows = inPeriod.filter((e) => e.property_id === p.propertyId)
    for (const e of rows) applyEntry(buckets, e)
    const totals = summarise(buckets)
    return {
      propertyId: p.propertyId,
      label: p.nickname || p.address,
      income: totals.income,
      expenses: totals.expenses,
      allowances: totals.allowances,
      adjustments: totals.adjustments,
      netWorkingPapers: totals.netWorkingPapers,
      entryCount: totals.entryCount,
      byCategory: buckets.filter((b) => b.count > 0),
    }
  })

  const orphanIds = new Set(
    inPeriod
      .filter((e) => !opts.properties.some((p) => p.propertyId === e.property_id))
      .map((e) => e.property_id),
  )
  for (const propertyId of orphanIds) {
    const buckets = emptyTotals()
    const rows = inPeriod.filter((e) => e.property_id === propertyId)
    for (const e of rows) applyEntry(buckets, e)
    const totals = summarise(buckets)
    byProperty.push({
      propertyId,
      label: `Unknown property (${propertyId.slice(0, 8)}…)`,
      income: totals.income,
      expenses: totals.expenses,
      allowances: totals.allowances,
      adjustments: totals.adjustments,
      netWorkingPapers: totals.netWorkingPapers,
      entryCount: totals.entryCount,
      byCategory: buckets.filter((b) => b.count > 0),
    })
  }

  const totals = summarise(byCategory)

  return {
    taxYear: opts.taxYear,
    quarter: opts.quarter,
    periodStart: toIsoDate(period.start),
    periodEnd: toIsoDate(period.end),
    generatedAt: (opts.generatedAt ?? new Date()).toISOString(),
    hmrcSubmission: false,
    downloadKind: "working_papers",
    disclaimer: MTD_DISCLAIMER,
    totals,
    byCategory: byCategory.filter((b) => b.count > 0),
    byProperty,
    entries: inPeriod,
  }
}

export function packToCsv(pack: MtdPack): string {
  const lines: string[] = [
    `# Metalyzi MTD Pack — NOT an HMRC submission`,
    `# ${pack.disclaimer}`,
    `# Tax year,${pack.taxYear}`,
    `# Period,${pack.periodStart} to ${pack.periodEnd}`,
    `# Quarter,${pack.quarter}`,
    `# Generated,${pack.generatedAt}`,
    `# hmrcSubmission,false`,
    `# downloadKind,working_papers`,
    "",
    "section,sa105_box,category,kind,property_id,property,count,total_gbp",
  ]

  const csvCell = (v: string | number | null) => {
    const s = v == null ? "" : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  for (const row of pack.byCategory) {
    lines.push(
      [
        "business_total",
        row.sa105Box ?? "",
        csvCell(row.label),
        row.kind,
        "",
        "UK property business",
        row.count,
        row.total.toFixed(2),
      ].join(","),
    )
  }

  for (const slice of pack.byProperty) {
    for (const row of slice.byCategory) {
      lines.push(
        [
          "property",
          row.sa105Box ?? "",
          csvCell(row.label),
          row.kind,
          csvCell(slice.propertyId),
          csvCell(slice.label),
          row.count,
          row.total.toFixed(2),
        ].join(","),
      )
    }
  }

  lines.push("")
  lines.push("entry_date,property_id,category_id,sa105_box,kind,amount,description,reference,source")
  for (const e of pack.entries) {
    const cat = getCategory(e.category_id)
    lines.push(
      [
        e.entry_date.slice(0, 10),
        csvCell(e.property_id),
        e.category_id,
        cat?.sa105Box ?? "",
        cat?.kind ?? "",
        Number(e.amount).toFixed(2),
        csvCell(e.description),
        csvCell(e.reference),
        e.source,
      ].join(","),
    )
  }

  lines.push("")
  lines.push(
    `totals,income,${pack.totals.income.toFixed(2)},expenses,${pack.totals.expenses.toFixed(2)},allowances,${pack.totals.allowances.toFixed(2)},adjustments,${pack.totals.adjustments.toFixed(2)},net_working_papers,${pack.totals.netWorkingPapers.toFixed(2)}`,
  )

  return lines.join("\n") + "\n"
}

export function packFilename(pack: MtdPack, format: "csv" | "json"): string {
  const q = pack.quarter === "year" ? "full-year" : `Q${pack.quarter}`
  return `metalyzi-mtd-pack-${pack.taxYear}-${q}.${format}`
}
