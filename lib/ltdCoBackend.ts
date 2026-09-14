/**
 * Backend calc API client for Personal vs Ltd Co.
 *
 * Flask `POST /v1/ltd-co/compare` on BACKEND_API_URL (metusa-deal-analyzer
 * PR #96) is the only live source of truth. There is no silent local-tax
 * fallback — a down or unusable BE returns an error so the UI cannot lean
 * from a second engine.
 */

import {
  BROKER_PLACEHOLDER,
  LTD_CO_DISCLAIMER,
  LTD_CO_TAX_YEAR,
  breakEvenYear,
  leanContainsBannedPhrase,
  leanCopy,
  leanSide,
  npvOf,
  type LtdCoCompareInput,
  type LtdCoCompareResult,
  type LtdCoYearRow,
} from "@/lib/ltdCoCompare"

export type LtdCoCalcSource = "backend"

export const LTD_CO_BACKEND_UNAVAILABLE =
  "The calc API is unavailable. Figures are not estimated locally — retry when the service is back."

export const LTD_CO_BACKEND_PATH = "/v1/ltd-co/compare"

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

const DEFAULT_LTV = 0.75

export function backendLtdCoUrl(base = BACKEND_API_URL): string {
  return `${base.replace(/\/$/, "")}${LTD_CO_BACKEND_PATH}`
}

function gbp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

function pctToRate(percent: number): number {
  return Number.isFinite(percent) ? percent / 100 : 0
}

export function toBackendComparePayload(input: LtdCoCompareInput): Record<string, unknown> {
  const purchase = Math.max(0, input.deal.purchasePrice || 0)
  const loan = purchase * DEFAULT_LTV
  const personalRate =
    loan > 0 ? input.deal.annualFinanceCosts / loan : 0.045
  return {
    horizonYears: input.horizon.years,
    discountRate: pctToRate(input.horizon.discountRatePercent),
    property: {
      purchasePrice: purchase,
      annualRent: input.deal.annualGrossRent,
      annualOperatingExpenses: input.deal.annualOperatingCosts,
    },
    financing: {
      ltv: DEFAULT_LTV,
      personalInterestRate: personalRate,
      companyInterestRate: personalRate,
    },
    landlord: {
      otherNonSavingsIncome: input.personal.otherTaxableIncome,
    },
    company: {
      associatedCompanies: input.company.associatedCompanies,
      annualComplianceCost: input.company.annualAccountancyCost,
      formationCost: input.company.setupCostYear1,
      extractDividends: "all",
    },
    growth: {
      rentGrowth: pctToRate(input.deal.rentGrowthPercent),
      expenseGrowth: pctToRate(input.deal.costGrowthPercent),
    },
  }
}

interface BeYear {
  year: number
  rent?: number
  operatingExpenses?: number
  financeCosts?: number
  tax?: number
  cashToIndividual?: number
  corporationTax?: number
  complianceCost?: number
  dividendTax?: number
  companyCashBeforeExtract?: number
  retainedInCompany?: number
}

interface BePath {
  years?: BeYear[]
  npv?: number
}

interface BeComparePayload {
  paths?: { A?: BePath; B?: BePath }
  npv?: { pathA?: number; pathB?: number }
  breakEven?: { year?: number | null }
  metadata?: {
    lean?: string
    leanStrength?: string
    notAdvice?: boolean
    rationale?: string
    disclaimers?: string[]
    breakEvenYear?: number | null
  }
  extractionLens?: {
    retainAll?: { wealthRetainedInCompany?: number; postCtProfit?: number }
  }
  horizonYears?: number
  engine?: { scope?: string }
}

export function isLtdCoCompareResult(
  value: unknown,
): value is LtdCoCompareResult {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  const personal = v.personal as Record<string, unknown> | undefined
  const retained = v.retained as Record<string, unknown> | undefined
  const extracted = v.extracted as Record<string, unknown> | undefined
  const flags = v.flags as Record<string, unknown> | undefined
  return (
    Array.isArray(v.years) &&
    typeof personal?.year1AfterTax === "number" &&
    typeof retained?.year1AfterTax === "number" &&
    typeof extracted?.year1AfterTax === "number" &&
    typeof retained?.copy === "string" &&
    typeof extracted?.copy === "string" &&
    flags?.educationalOnly === true
  )
}

export function isBackendCompareResult(value: unknown): value is BeComparePayload {
  if (!value || typeof value !== "object") return false
  const v = value as BeComparePayload
  return Array.isArray(v.paths?.A?.years) && Array.isArray(v.paths?.B?.years)
}

export function unwrapLtdCoComparePayload(
  payload: unknown,
): LtdCoCompareResult | null {
  if (isLtdCoCompareResult(payload)) return payload
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  for (const key of ["ltdCoCompare", "ltd_co_compare", "result", "data"]) {
    if (isLtdCoCompareResult(p[key])) return p[key] as LtdCoCompareResult
  }
  return null
}

function sanitizeLean(copy: string, side: "retained" | "extracted", lean: ReturnType<typeof leanSide>): string {
  if (!copy || leanContainsBannedPhrase(copy)) return leanCopy(lean, side)
  return copy
}

export function mapBackendCompareToUi(
  be: BeComparePayload,
  input: LtdCoCompareInput,
): LtdCoCompareResult {
  const aOps = (be.paths?.A?.years ?? []).filter((y) => y.year >= 1)
  const bOps = (be.paths?.B?.years ?? []).filter((y) => y.year >= 1)
  const rows: LtdCoYearRow[] = []
  let personalCum = 0
  let retainedCum = 0
  let extractedCum = 0
  const personalCf: number[] = []
  const retainedCf: number[] = []
  const extractedCf: number[] = []

  for (let i = 0; i < Math.min(aOps.length, bOps.length); i++) {
    const a = aOps[i]
    const b = bOps[i]
    const personalAfterTax = gbp(a.cashToIndividual ?? 0)
    const retainedAfterTax = gbp(
      b.companyCashBeforeExtract ?? b.retainedInCompany ?? 0,
    )
    const extractedAfterTax = gbp(b.cashToIndividual ?? 0)
    personalCum += personalAfterTax
    retainedCum += retainedAfterTax
    extractedCum += extractedAfterTax
    personalCf.push(personalAfterTax)
    retainedCf.push(retainedAfterTax)
    extractedCf.push(extractedAfterTax)
    rows.push({
      year: a.year,
      rent: gbp(a.rent ?? 0),
      operatingCosts: gbp(a.operatingExpenses ?? 0),
      financeCosts: gbp(a.financeCosts ?? 0),
      personalTax: gbp(a.tax ?? 0),
      personalAfterTax,
      personalCumulative: personalCum,
      ltdCorporationTax: gbp(b.corporationTax ?? 0),
      ltdAccountancy: gbp(b.complianceCost ?? 0),
      ltdRetainedAfterTax: retainedAfterTax,
      ltdRetainedCumulative: retainedCum,
      ltdDividendTax: gbp(b.dividendTax ?? 0),
      ltdExtractedAfterTax: extractedAfterTax,
      ltdExtractedCumulative: extractedCum,
    })
  }

  const retainedDelta = retainedCum - personalCum
  const extractedDelta = extractedCum - personalCum
  const retainedLean = leanSide(retainedDelta)
  const extractedLean = leanSide(extractedDelta)
  const metaLean = be.metadata?.lean
  const extractedFromMeta: ReturnType<typeof leanSide> =
    metaLean === "path_b_company"
      ? "ltd"
      : metaLean === "path_a_personal"
        ? "personal"
        : metaLean === "neutral"
          ? "close"
          : extractedLean

  const beBreak = be.breakEven?.year
  const extractedBreakEven =
    typeof beBreak === "number" && beBreak >= 1 ? beBreak : null

  const region = input.personal.region
  const devolved = region === "scotland" || region === "wales"
  const disclaimers = be.metadata?.disclaimers ?? []

  return {
    taxYear: LTD_CO_TAX_YEAR,
    mode: input.mode === "broker" ? "broker" : "landlord",
    disclaimer: LTD_CO_DISCLAIMER,
    flags: {
      devolvedNation: devolved,
      devolvedNationNote: devolved
        ? region === "scotland"
          ? "Scotland selected — this comparison still uses England & Northern Ireland income-tax bands. Scottish bands and rates differ. Treat this as a directional flag, not a Scotland-specific model."
          : "Wales selected — this comparison uses England & Northern Ireland income-tax bands. Welsh rates currently follow England; this is a flag only, not a Wales-specific model."
        : null,
      educationalOnly: true,
    },
    assumptions: [
      ...disclaimers,
      "Path A = hold personally (Section 24). Path B = buy in a limited company.",
      "Entity-retained lens uses company cash after corporation tax, before dividends. Owner-extracted lens uses cash paid out as dividends.",
      "NPV from the calc API includes acquisition (year 0). Year-1 and cumulative figures above are operating years only.",
    ],
    personal: {
      year1AfterTax: rows[0]?.personalAfterTax ?? 0,
      cumulative: personalCum,
      npv: gbp(be.npv?.pathA ?? npvOf(personalCf, input.horizon.discountRatePercent)),
      breakEvenYear: null,
      lean: "personal",
      copy: "Personal holding is the baseline on both lenses.",
      cumulativeDelta: 0,
    },
    retained: {
      year1AfterTax: rows[0]?.ltdRetainedAfterTax ?? 0,
      cumulative: retainedCum,
      npv: npvOf(retainedCf, input.horizon.discountRatePercent),
      breakEvenYear: breakEvenYear(
        rows.map((r) => r.ltdRetainedCumulative),
        rows.map((r) => r.personalCumulative),
      ),
      lean: retainedLean,
      copy: leanCopy(retainedLean, "retained"),
      cumulativeDelta: retainedDelta,
    },
    extracted: {
      year1AfterTax: rows[0]?.ltdExtractedAfterTax ?? 0,
      cumulative: extractedCum,
      npv: gbp(be.npv?.pathB ?? npvOf(extractedCf, input.horizon.discountRatePercent)),
      breakEvenYear: extractedBreakEven,
      lean: extractedFromMeta,
      copy: sanitizeLean(
        be.metadata?.rationale ?? "",
        "extracted",
        extractedFromMeta,
      ),
      cumulativeDelta: extractedDelta,
    },
    years: rows,
    broker: BROKER_PLACEHOLDER,
  }
}

export type LtdCoCompareFetchResult =
  | {
      ok: true
      ltdCoCompare: LtdCoCompareResult
      source: LtdCoCalcSource
    }
  | {
      ok: false
      ltdCoCompare: null
      source: null
      error: string
    }

export async function fetchLtdCoCompare(
  input: LtdCoCompareInput,
  opts?: { fetchImpl?: typeof fetch; backendUrl?: string; timeoutMs?: number },
): Promise<LtdCoCompareFetchResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch
  const timeoutMs = opts?.timeoutMs ?? 8_000
  const url = backendLtdCoUrl(opts?.backendUrl ?? BACKEND_API_URL)

  try {
    const resp = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBackendComparePayload(input)),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (resp.ok) {
      const json = await resp.json().catch(() => null)
      const native = unwrapLtdCoComparePayload(json)
      if (native) return { ok: true, ltdCoCompare: native, source: "backend" }
      const be = isBackendCompareResult(json)
        ? json
        : json && typeof json === "object"
          ? (["result", "data", "ltdCoCompare"].map(
              (k) => (json as Record<string, unknown>)[k],
            ).find(isBackendCompareResult) as BeComparePayload | undefined)
          : undefined
      if (be) {
        return {
          ok: true,
          ltdCoCompare: mapBackendCompareToUi(be, input),
          source: "backend",
        }
      }
    }
  } catch {
    /* timeout, network, or parse — still no local lean */
  }

  return {
    ok: false,
    ltdCoCompare: null,
    source: null,
    error: LTD_CO_BACKEND_UNAVAILABLE,
  }
}
