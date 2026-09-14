import type { MtdCategoryKind, Sa105Category } from "./types"

/**
 * Flask MTD Pack v1 SA105 catalogue (metusa-deal-analyzer mtd/categories.json).
 * Residential finance MUST stay separate from non-residential box 26.
 */
export const SA105_CATEGORIES: readonly Sa105Category[] = [
  {
    code: "uk_rent_income",
    name: "Rents and other income from UK property",
    kind: "income",
    sa105Box: "20",
    hmrcField: "income.periodAmount",
    isResidentialFinance: false,
    aliases: ["rent", "rents", "rental income", "uk rent", "periodamount", "box 20", "box20"],
  },
  {
    code: "tax_taken_off",
    name: "Tax taken off any income",
    kind: "income_adjustment",
    sa105Box: "21",
    hmrcField: "income.taxDeducted",
    isResidentialFinance: false,
    aliases: ["tax deducted", "tax taken off", "taxdeducted", "box 21", "box21"],
  },
  {
    code: "lease_premiums",
    name: "Premiums for the grant of a lease",
    kind: "income",
    sa105Box: "22",
    hmrcField: "income.premiumsOfLeaseGrant",
    isResidentialFinance: false,
    aliases: ["lease premium", "premiums of lease grant", "premiumsofleasegrant", "box 22", "box22"],
  },
  {
    code: "reverse_premiums",
    name: "Reverse premiums and inducements",
    kind: "income",
    sa105Box: "23",
    hmrcField: "income.reversePremiums",
    isResidentialFinance: false,
    aliases: ["reverse premium", "inducement", "reversepremiums", "box 23", "box23"],
  },
  {
    code: "other_property_income",
    name: "Other property income",
    kind: "income",
    sa105Box: "20",
    hmrcField: "income.otherIncome",
    isResidentialFinance: false,
    aliases: ["other income", "otherincome", "service charge income"],
  },
  {
    code: "rent_a_room",
    name: "Rent a Room receipts",
    kind: "income",
    sa105Box: "38",
    hmrcField: "income.rentARoom.rentsReceived",
    isResidentialFinance: false,
    aliases: ["rent a room", "rentaroom", "rents received"],
  },
  {
    code: "premises_running_costs",
    name: "Rent, rates, insurance and ground rents",
    kind: "expense",
    sa105Box: "24",
    hmrcField: "expenses.premisesRunningCosts",
    isResidentialFinance: false,
    aliases: ["insurance", "ground rent", "rates", "council tax", "premises", "premisesrunningcosts", "box 24", "box24"],
  },
  {
    code: "repairs_and_maintenance",
    name: "Property repairs and maintenance",
    kind: "expense",
    sa105Box: "25",
    hmrcField: "expenses.repairsAndMaintenance",
    isResidentialFinance: false,
    aliases: ["repairs", "maintenance", "repairsandmaintenance", "box 25", "box25"],
  },
  {
    code: "non_residential_finance_costs",
    name: "Loan interest and other financial costs (non-residential)",
    kind: "expense",
    sa105Box: "26",
    hmrcField: "expenses.financialCosts",
    isResidentialFinance: false,
    aliases: ["commercial finance", "non-residential finance", "non residential finance", "financialcosts", "box 26", "box26"],
  },
  {
    code: "professional_fees",
    name: "Legal, management and other professional fees",
    kind: "expense",
    sa105Box: "27",
    hmrcField: "expenses.professionalFees",
    isResidentialFinance: false,
    aliases: ["legal", "management fees", "accountancy", "professional fees", "professionalfees", "agent fees", "box 27", "box27"],
  },
  {
    code: "cost_of_services",
    name: "Costs of services provided, including wages",
    kind: "expense",
    sa105Box: "28",
    hmrcField: "expenses.costOfServices",
    isResidentialFinance: false,
    aliases: ["wages", "services", "costofservices", "utilities recharge", "box 28", "box28"],
  },
  {
    code: "travel_costs",
    name: "Travel costs",
    kind: "expense",
    sa105Box: "29",
    hmrcField: "expenses.travelCosts",
    isResidentialFinance: false,
    aliases: ["travel", "mileage", "travelcosts"],
  },
  {
    code: "other_allowable_expenses",
    name: "Other allowable property expenses",
    kind: "expense",
    sa105Box: "29",
    hmrcField: "expenses.other",
    isResidentialFinance: false,
    aliases: ["other", "other expenses", "sundry", "box 29", "box29"],
  },
  {
    code: "replacing_domestic_items",
    name: "Costs of replacing domestic items",
    kind: "expense",
    sa105Box: "37",
    hmrcField: "expenses.other",
    isResidentialFinance: false,
    aliases: ["domestic items", "replacement furniture", "white goods", "box 37", "box37"],
  },
  {
    code: "residential_finance_costs",
    name: "Residential finance costs",
    kind: "residential_finance",
    sa105Box: "44",
    hmrcField: "expenses.residentialFinancialCost",
    isResidentialFinance: true,
    aliases: ["mortgage interest", "residential finance", "residential interest", "residentialfinancialcost", "finance costs", "box 44", "box44"],
  },
  {
    code: "residential_finance_costs_bf",
    name: "Unused residential finance costs brought forward",
    kind: "residential_finance",
    sa105Box: "45",
    hmrcField: "expenses.residentialFinancialCostsCarriedForward",
    isResidentialFinance: true,
    aliases: ["finance brought forward", "residential finance bf", "residentialfinancialcostscarriedforward", "box 45", "box45"],
  },
  {
    code: "private_use_adjustment",
    name: "Private use adjustment",
    kind: "adjustment",
    sa105Box: "30",
    hmrcField: null,
    isResidentialFinance: false,
    aliases: ["private use", "box 30", "box30"],
  },
] as const

export const RESIDENTIAL_FINANCE_CODES = new Set([
  "residential_finance_costs",
  "residential_finance_costs_bf",
])

const BY_CODE = new Map(SA105_CATEGORIES.map((c) => [c.code, c]))

export function getCategory(code: string): Sa105Category | undefined {
  return BY_CODE.get(code)
}

export function isCategoryId(code: string): boolean {
  return BY_CODE.has(code)
}

export function categoriesByKind(kind: MtdCategoryKind): Sa105Category[] {
  return SA105_CATEGORIES.filter((c) => c.kind === kind)
}

export const CATEGORY_KIND_ORDER: MtdCategoryKind[] = [
  "income",
  "income_adjustment",
  "expense",
  "residential_finance",
  "adjustment",
]

export function kindLabel(kind: MtdCategoryKind): string {
  switch (kind) {
    case "income":
      return "Income"
    case "income_adjustment":
      return "Income adjustments"
    case "expense":
      return "Expenses"
    case "residential_finance":
      return "Residential finance (not a profit deduction)"
    case "adjustment":
      return "Adjustments"
  }
}

export function matchCategory(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = raw.trim().toLowerCase()
  if (!text) return null
  if (BY_CODE.has(text)) return text
  const boxMatch = text.match(/\bbox\s*(\d{2})\b/)
  if (boxMatch) {
    const boxed = SA105_CATEGORIES.find((c) => c.sa105Box === boxMatch[1])
    if (boxed) return boxed.code
  }
  for (const c of SA105_CATEGORIES) {
    if (c.name.toLowerCase() === text) return c.code
    if (c.aliases.some((a) => a === text)) return c.code
  }
  const aliasHits: { code: string; alias: string }[] = []
  for (const c of SA105_CATEGORIES) {
    for (const alias of c.aliases) {
      if (text.includes(alias)) aliasHits.push({ code: c.code, alias })
    }
  }
  aliasHits.sort((a, b) => b.alias.length - a.alias.length)
  return aliasHits[0]?.code ?? null
}

export function isResidentialFinance(code: string): boolean {
  return RESIDENTIAL_FINANCE_CODES.has(code)
}
