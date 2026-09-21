import { PersonalVsLtdCalculator } from "@/components/tools/personal-vs-ltd-calculator"
import { fetchLtdCoCompare } from "@/lib/ltdCoBackend"
import {
  DEFAULT_LTD_CO_INPUT,
  validateLtdCoCompareInput,
  type CalculatorMode,
  type LtdCoCompareInput,
  type LtdCoCompareResult,
  type UkRegion,
} from "@/lib/ltdCoCompare"

function last(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? ""
  return value ?? ""
}

function num(raw: string, fallback: number): number {
  const n = Number(String(raw).replace(/,/g, ""))
  return Number.isFinite(n) && raw !== "" ? n : fallback
}

function numIfPresent(
  raw: string,
  present: boolean,
  fallback: number,
): number {
  if (!present) return fallback
  if (raw === "") return 0
  const n = Number(String(raw).replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

export default async function PersonalVsLtdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const q = (key: string) => last(raw[key])
  const has = (key: string) => raw[key] !== undefined
  const understood = q("understood") === "1"

  const dealIdRaw = q("dealId")
  const dealId =
    dealIdRaw &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      dealIdRaw,
    )
      ? dealIdRaw
      : null

  const continueParams = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    const s = last(value)
    if (key === "understood" || !s) continue
    continueParams.set(key, s)
  }
  continueParams.set("understood", "1")
  const continueHref = `/tools/personal-vs-ltd?${continueParams.toString()}`

  const d = DEFAULT_LTD_CO_INPUT
  const regionRaw = q("region")
  const region: UkRegion =
    regionRaw === "scotland" || regionRaw === "wales" ? regionRaw : "england-ni"
  const mode: CalculatorMode = q("mode") === "broker" ? "broker" : "landlord"
  const lens = q("lens") === "extracted" ? "extracted" : "retained"

  const input: LtdCoCompareInput = {
    mode,
    dealId,
    deal: {
      annualGrossRent: numIfPresent(
        q("annualGrossRent"),
        has("annualGrossRent"),
        d.deal.annualGrossRent,
      ),
      annualOperatingCosts: num(
        q("annualOperatingCosts"),
        d.deal.annualOperatingCosts,
      ),
      annualFinanceCosts: num(q("annualFinanceCosts"), d.deal.annualFinanceCosts),
      rentGrowthPercent: num(q("rentGrowthPercent"), d.deal.rentGrowthPercent),
      costGrowthPercent: num(q("costGrowthPercent"), d.deal.costGrowthPercent),
      financeGrowthPercent: num(
        q("financeGrowthPercent"),
        d.deal.financeGrowthPercent,
      ),
      purchasePrice: numIfPresent(
        q("purchasePrice"),
        has("purchasePrice"),
        d.deal.purchasePrice,
      ),
    },
    personal: {
      otherTaxableIncome: num(
        q("otherTaxableIncome"),
        d.personal.otherTaxableIncome,
      ),
      region,
    },
    company: {
      associatedCompanies: Math.max(
        0,
        Math.floor(num(q("associatedCompanies"), d.company.associatedCompanies)),
      ),
      annualAccountancyCost: num(
        q("annualAccountancyCost"),
        d.company.annualAccountancyCost,
      ),
      otherCompanyProfits: num(
        q("otherCompanyProfits"),
        d.company.otherCompanyProfits,
      ),
      setupCostYear1: num(q("setupCostYear1"), d.company.setupCostYear1),
    },
    horizon: {
      years: Math.min(30, Math.max(1, Math.floor(num(q("years"), d.horizon.years)) || 1)),
      discountRatePercent: num(
        q("discountRatePercent"),
        d.horizon.discountRatePercent,
      ),
    },
  }

  let initialResult: LtdCoCompareResult | null = null
  let initialError: string | null = null
  let initialErrorKind: "validation" | "unavailable" | null = null
  let initialSource: "backend" | null = null
  if (understood) {
    const invalid = validateLtdCoCompareInput(input)
    if (invalid) {
      initialError = invalid.message
      initialErrorKind = "validation"
    } else {
      const fetched = await fetchLtdCoCompare(input)
      if (fetched.ok) {
        initialResult = fetched.ltdCoCompare
        initialSource = "backend"
      } else {
        initialError = fetched.error
        initialErrorKind = fetched.reason
      }
    }
  }

  return (
    <PersonalVsLtdCalculator
      dealId={dealId}
      continueHref={continueHref}
      initialUnderstood={understood}
      initialResult={initialResult}
      initialError={initialError}
      initialErrorKind={initialErrorKind}
      initialSource={initialSource}
      initialMode={mode}
      initialLens={lens}
      initialFields={{
        annualGrossRent: has("annualGrossRent")
          ? q("annualGrossRent")
          : String(input.deal.annualGrossRent),
        annualOperatingCosts: String(input.deal.annualOperatingCosts),
        annualFinanceCosts: String(input.deal.annualFinanceCosts),
        purchasePrice: has("purchasePrice")
          ? q("purchasePrice")
          : String(input.deal.purchasePrice),
        rentGrowthPercent: String(input.deal.rentGrowthPercent),
        costGrowthPercent: String(input.deal.costGrowthPercent),
        financeGrowthPercent: String(input.deal.financeGrowthPercent),
        otherTaxableIncome: String(input.personal.otherTaxableIncome),
        region: input.personal.region,
        associatedCompanies: String(input.company.associatedCompanies),
        annualAccountancyCost: String(input.company.annualAccountancyCost),
        otherCompanyProfits: String(input.company.otherCompanyProfits),
        setupCostYear1: String(input.company.setupCostYear1),
        years: String(input.horizon.years),
        discountRatePercent: String(input.horizon.discountRatePercent),
      }}
    />
  )
}
