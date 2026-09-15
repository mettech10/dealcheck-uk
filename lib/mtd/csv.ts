export const CSV_TEMPLATE_HEADERS = [
  "date",
  "property_id",
  "category",
  "amount_pence",
  "description",
  "counterparty",
] as const

export const CSV_TEMPLATE_BODY = `2026-04-10,11111111-1111-1111-1111-111111111111,uk_rent_income,125000,April rent,Tenant A
2026-04-12,11111111-1111-1111-1111-111111111111,repairs,4500,Boiler service,GasSafe Ltd
2026-04-15,11111111-1111-1111-1111-111111111111,mortgage interest,32000,Residential mortgage interest April,Lender
2026-04-20,11111111-1111-1111-1111-111111111111,insurance,12000,Buildings insurance,Insurer
`

export function csvTemplate(): string {
  return `${CSV_TEMPLATE_HEADERS.join(",")}\n${CSV_TEMPLATE_BODY}`
}

/** Fill blank property_id cells with the platform portfolio UUID before Flask commit. */
export function injectPropertyId(csvText: string, propertyId: string): string {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/)
  if (lines.length === 0) return csvText
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase())
  let idx = header.indexOf("property_id")
  const out = [...lines]
  if (idx < 0) {
    out[0] = `${lines[0]},property_id`
    idx = header.length
    for (let i = 1; i < out.length; i++) {
      if (!out[i].trim()) continue
      out[i] = `${out[i]},${propertyId}`
    }
    return out.join("\n")
  }
  for (let i = 1; i < out.length; i++) {
    if (!out[i].trim()) continue
    const cells = splitCsvLine(out[i])
    while (cells.length <= idx) cells.push("")
    if (!cells[idx].trim()) cells[idx] = propertyId
    out[i] = cells.map(csvCell).join(",")
  }
  return out.join("\n")
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ",") {
      cells.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
