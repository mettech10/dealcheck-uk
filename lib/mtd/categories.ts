import type { MtdCategoryKind, Sa105Category } from "./types"

/**
 * HMRC SA105 (UK property) aligned category list for MTD Pack v1.
 *
 * Box numbers follow SA105 UK Property pages. `hmrcField` maps to the
 * MTD ITSA UK-property business schema so packs stay accountant-readable.
 * This is categorisation for working papers — not a filing schema.
 */
export const SA105_CATEGORIES: readonly Sa105Category[] = [
  // ── Income ────────────────────────────────────────────────────────
  {
    id: "rent",
    label: "Rents and other income from property",
    kind: "income",
    sa105Box: "21",
    hmrcField: "periodAmount",
    description: "Rent received, including other property income that belongs in SA105 box 21.",
    aliases: ["rent", "rental income", "rents", "income", "lettings", "box 21", "turnover"],
  },
  {
    id: "premiums_of_lease_grant",
    label: "Premiums for granting a lease",
    kind: "income",
    sa105Box: "21",
    hmrcField: "premiumsOfLeaseGrant",
    description: "Lease premiums treated as property income.",
    aliases: ["lease premium", "premium", "grant of lease"],
  },
  {
    id: "reverse_premiums",
    label: "Reverse premiums",
    kind: "income",
    sa105Box: "21",
    hmrcField: "reversePremiums",
    description: "Reverse premiums received from a landlord or tenant.",
    aliases: ["reverse premium"],
  },
  {
    id: "other_income",
    label: "Other property income",
    kind: "income",
    sa105Box: "21",
    hmrcField: "otherIncome",
    description: "Other UK property income not recorded as rent.",
    aliases: ["other income", "sundry", "other property"],
  },
  {
    id: "tax_taken_off",
    label: "Tax taken off any income",
    kind: "income",
    sa105Box: "22",
    hmrcField: "taxDeducted",
    description: "Tax already deducted from property income (SA105 box 22). Record the tax amount, not the gross rent.",
    aliases: ["tax deducted", "tax taken off", "box 22", "withholding"],
  },
  {
    id: "rent_a_room",
    label: "Rent a Room income",
    kind: "income",
    sa105Box: "38",
    hmrcField: "rentARoom",
    description: "Income that may qualify for Rent a Room relief (SA105 box 38).",
    aliases: ["rent a room", "lodger", "box 38"],
  },

  // ── Expenses ──────────────────────────────────────────────────────
  {
    id: "premises_running_costs",
    label: "Rent, rates, insurance, ground rents",
    kind: "expense",
    sa105Box: "24",
    hmrcField: "premisesRunningCosts",
    description: "Premises running costs: rent, business rates, buildings insurance, ground rent, service charge.",
    aliases: [
      "insurance",
      "ground rent",
      "service charge",
      "rates",
      "council tax",
      "box 24",
      "premises",
      "buildings insurance",
    ],
  },
  {
    id: "repairs_and_maintenance",
    label: "Repairs, maintenance and renewals",
    kind: "expense",
    sa105Box: "25",
    hmrcField: "repairsAndMaintenance",
    description: "Allowable repairs and maintenance. Capital improvements do not belong here.",
    aliases: [
      "repairs",
      "maintenance",
      "renewals",
      "box 25",
      "plumber",
      "electrician",
      "decorator",
      "boiler",
    ],
  },
  {
    id: "financial_costs",
    label: "Loan interest and other financial costs",
    kind: "expense",
    sa105Box: "26",
    hmrcField: "financialCosts",
    description: "Non-residential finance costs and other allowable financial costs (SA105 box 26).",
    aliases: ["interest", "finance", "loan interest", "box 26", "bank charges", "mortgage interest"],
  },
  {
    id: "professional_fees",
    label: "Legal, management and professional fees",
    kind: "expense",
    sa105Box: "27",
    hmrcField: "professionalFees",
    description: "Letting agent fees, accountancy, legal fees relating to the property business.",
    aliases: [
      "management",
      "agent fees",
      "letting agent",
      "legal",
      "solicitor",
      "accountant",
      "accountancy",
      "box 27",
      "professional",
    ],
  },
  {
    id: "cost_of_services",
    label: "Costs of services provided, including wages",
    kind: "expense",
    sa105Box: "28",
    hmrcField: "costOfServices",
    description: "Services supplied with the letting, including wages (gas, electricity, cleaning where allowable).",
    aliases: ["wages", "utilities", "gas", "electricity", "cleaning", "box 28", "services", "bills"],
  },
  {
    id: "travel_costs",
    label: "Travel costs",
    kind: "expense",
    sa105Box: "29",
    hmrcField: "travelCosts",
    description: "Allowable travel for the property business (typically recorded under other expenses on SA105).",
    aliases: ["travel", "mileage", "petrol", "fuel", "parking"],
  },
  {
    id: "other_expenses",
    label: "Other allowable property expenses",
    kind: "expense",
    sa105Box: "29",
    hmrcField: "other",
    description: "Other allowable revenue expenses that do not fit boxes 24–28.",
    aliases: ["other", "sundry expenses", "box 29", "advertising", "safety certificate", "epc"],
  },
  {
    id: "residential_finance_cost",
    label: "Residential finance costs (restricted)",
    kind: "expense",
    sa105Box: "44",
    hmrcField: "residentialFinancialCost",
    description:
      "Residential landlord finance costs reported in SA105 box 44. These are restricted for tax and shown separately from box 26.",
    aliases: [
      "residential finance",
      "box 44",
      "mortgage",
      "btl mortgage",
      "finance cost restriction",
    ],
  },

  // ── Allowances ────────────────────────────────────────────────────
  {
    id: "replacement_domestic_items",
    label: "Replacement of domestic items",
    kind: "allowance",
    sa105Box: "37",
    hmrcField: "costOfReplacingDomesticItems",
    description: "Replacement furniture / domestic items relief (SA105 box 37).",
    aliases: ["furniture", "white goods", "sofa", "bed", "replacement", "box 37", "domestic items"],
  },
  {
    id: "capital_allowances",
    label: "Capital allowances",
    kind: "allowance",
    sa105Box: "35",
    hmrcField: "otherCapitalAllowance",
    description: "Capital allowances claimed against the property business (SA105 box 35).",
    aliases: ["capital allowance", "box 35", "plant and machinery"],
  },
  {
    id: "annual_investment_allowance",
    label: "Annual investment allowance",
    kind: "allowance",
    sa105Box: "35",
    hmrcField: "annualInvestmentAllowance",
    description: "AIA claimed on qualifying plant and machinery.",
    aliases: ["aia", "annual investment"],
  },
  {
    id: "property_income_allowance",
    label: "Property income allowance",
    kind: "allowance",
    sa105Box: null,
    hmrcField: "propertyIncomeAllowance",
    description: "Property allowance (where claimed instead of expenses). Use only if you are claiming the allowance.",
    aliases: ["property allowance", "trading allowance", "£1,000 allowance"],
  },

  // ── Adjustments ───────────────────────────────────────────────────
  {
    id: "private_use",
    label: "Private use adjustment",
    kind: "adjustment",
    sa105Box: "33",
    hmrcField: "privateUseAdjustment",
    description: "Add-back for private use of property expenses (SA105 box 33).",
    aliases: ["private use", "box 33", "add back", "disallowable"],
  },
  {
    id: "balancing_charges",
    label: "Balancing charges",
    kind: "adjustment",
    sa105Box: "34",
    hmrcField: "balancingCharges",
    description: "Balancing charges on disposal of assets (SA105 box 34).",
    aliases: ["balancing charge", "box 34"],
  },
] as const

const BY_ID = new Map(SA105_CATEGORIES.map((c) => [c.id, c]))

export function getCategory(id: string): Sa105Category | undefined {
  return BY_ID.get(id)
}

export function isCategoryId(id: string): boolean {
  return BY_ID.has(id)
}

export function categoriesByKind(kind: MtdCategoryKind): Sa105Category[] {
  return SA105_CATEGORIES.filter((c) => c.kind === kind)
}

export const CATEGORY_KIND_ORDER: MtdCategoryKind[] = [
  "income",
  "expense",
  "allowance",
  "adjustment",
]

export function kindLabel(kind: MtdCategoryKind): string {
  switch (kind) {
    case "income":
      return "Income"
    case "expense":
      return "Expenses"
    case "allowance":
      return "Allowances"
    case "adjustment":
      return "Adjustments"
  }
}

/**
 * Best-effort map of free-text (CSV category column or description) onto a
 * SA105 category id. Returns null when nothing is confident.
 */
export function matchCategory(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = raw.trim().toLowerCase()
  if (!text) return null

  const exact = SA105_CATEGORIES.find((c) => c.id === text)
  if (exact) return exact.id

  const boxMatch = text.match(/\bbox\s*(\d{2})\b/)
  if (boxMatch) {
    const boxed = SA105_CATEGORIES.find((c) => c.sa105Box === boxMatch[1])
    if (boxed) return boxed.id
  }

  for (const c of SA105_CATEGORIES) {
    if (c.label.toLowerCase() === text) return c.id
    if (c.aliases.some((a) => a === text)) return c.id
  }

  // Longer aliases first so "letting agent" wins over "agent"
  const aliasHits: { id: string; alias: string }[] = []
  for (const c of SA105_CATEGORIES) {
    for (const alias of c.aliases) {
      if (text.includes(alias)) aliasHits.push({ id: c.id, alias })
    }
  }
  aliasHits.sort((a, b) => b.alias.length - a.alias.length)
  return aliasHits[0]?.id ?? null
}
