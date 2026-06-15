/**
 * Metalyzi Intelligence Accumulation Pipeline (Section 3)
 * =======================================================
 *
 * Every time an analysis runs, this updates the four intelligence tables so
 * the platform's accumulated expertise grows over time. Always invoked
 * fire-and-forget from the analysis flow (Section 5) — it must NEVER block or
 * fail the user's response, so every call site wraps it in `.catch()` and the
 * internal work runs under `Promise.allSettled`.
 *
 * Adaptations from the original spec:
 *  - Uses the project's createAdminClient() (service-role key) rather than a
 *    hand-rolled client with the wrong env-var name.
 *  - Canonicalises strategy ids to the actual column suffixes:
 *    brr→brrrr, r2sa→sa, development→dev (btl/hmo/flip unchanged).
 *  - Loosely typed but no `any`; all reads are defensive.
 */
import { createAdminClient } from "@/lib/supabase/admin"

type Loose = Record<string, unknown>

// Canonical strategy keys map 1:1 onto the *_deal_count columns.
type Canonical = "btl" | "hmo" | "brrrr" | "sa" | "flip" | "dev"

function canonicalStrategy(s: string): Canonical | null {
  switch ((s || "").toLowerCase()) {
    case "btl":
      return "btl"
    case "hmo":
      return "hmo"
    case "brr":
    case "brrrr":
      return "brrrr"
    case "r2sa":
    case "sa":
      return "sa"
    case "flip":
      return "flip"
    case "development":
    case "dev":
      return "dev"
    default:
      return null
  }
}

// Uppercase label used for platform_benchmarks.metric_name + deal_patterns.strategy
const STRATEGY_LABEL: Record<Canonical, string> = {
  btl: "BTL",
  hmo: "HMO",
  brrrr: "BRRRR",
  sa: "SA",
  flip: "FLIP",
  dev: "DEV",
}

// ── defensive accessors ─────────────────────────────────────────────────────
function num(obj: Loose, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

function str(obj: Loose, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim() !== "") return v
  }
  return null
}

/** Incremental mean: new_avg = old + (value - old) / n. */
function runningMean(old: number | null, value: number, n: number): number {
  if (old === null || n <= 1) return value
  return old + (value - old) / n
}

type Supa = ReturnType<typeof createAdminClient>

// ── entry point ─────────────────────────────────────────────────────────────
export async function recordAnalysisToIntelligence(
  userId: string,
  postcode: string,
  strategy: string,
  formData: Loose,
  result: Loose,
): Promise<void> {
  const district = (postcode || "").split(" ")[0].toUpperCase()
  if (!district) return
  const area = district.replace(/[0-9]/g, "")
  const canonical = canonicalStrategy(strategy)
  if (!canonical) return

  const supabase = createAdminClient()

  await Promise.allSettled([
    updateAreaIntelligence(supabase, district, canonical, formData, result),
    updateUserProfile(supabase, userId, district, canonical, formData, result),
    detectAndStorePatterns(supabase, district, area, canonical, formData, result),
    updatePlatformBenchmarks(supabase, canonical, result),
  ])
}

// ── area intelligence ───────────────────────────────────────────────────────
async function updateAreaIntelligence(
  supabase: Supa,
  district: string,
  canonical: Canonical,
  formData: Loose,
  result: Loose,
): Promise<void> {
  const { data: existing } = await supabase
    .from("area_intelligence")
    .select("*")
    .eq("postcode_district", district)
    .maybeSingle()

  const current: Loose = existing ?? { postcode_district: district, deal_count: 0 }
  const newCount = (num(current, "deal_count") ?? 0) + 1
  const strategyKey = `${canonical}_deal_count`

  const updates: Loose = {
    postcode_district: district,
    deal_count: newCount,
    [strategyKey]: (num(current, strategyKey) ?? 0) + 1,
    last_updated: new Date().toISOString(),
    confidence_level: newCount >= 50 ? "high" : newCount >= 10 ? "medium" : "low",
  }

  const grossYield = num(result, "grossYield", "gross_yield")
  if (grossYield !== null && canonical === "btl") {
    updates.median_btl_gross_yield = runningMean(num(current, "median_btl_gross_yield"), grossYield, newCount)
  }
  if (grossYield !== null && canonical === "hmo") {
    updates.median_hmo_gross_yield = runningMean(num(current, "median_hmo_gross_yield"), grossYield, newCount)
  }

  const cashflow = num(result, "monthlyCashflow", "monthly_cashflow")
  if (cashflow !== null) {
    const cashflowKey = canonical === "hmo" ? "median_hmo_monthly_cashflow" : "median_btl_monthly_cashflow"
    updates[cashflowKey] = runningMean(num(current, cashflowKey), cashflow, newCount)
  }

  const price = num(formData, "purchasePrice", "purchase_price")
  if (price !== null) {
    updates.median_purchase_price = runningMean(num(current, "median_purchase_price"), price, newCount)
  }

  // Dominant strategy across the running per-strategy counts.
  const counts: Record<string, number> = {}
  for (const c of ["btl", "hmo", "brrrr", "sa", "flip", "dev"] as Canonical[]) {
    counts[STRATEGY_LABEL[c]] = num(current, `${c}_deal_count`) ?? 0
  }
  counts[STRATEGY_LABEL[canonical]] += 1
  updates.dominant_strategy = Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0]

  await supabase.from("area_intelligence").upsert(updates, { onConflict: "postcode_district" })
}

// ── user investor profile ───────────────────────────────────────────────────
async function updateUserProfile(
  supabase: Supa,
  userId: string,
  district: string,
  canonical: Canonical,
  formData: Loose,
  result: Loose,
): Promise<void> {
  if (!userId) return

  const { data: existing } = await supabase
    .from("user_investor_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  const e: Loose = existing ?? {}
  const totalAnalyses = (num(e, "total_analyses") ?? 0) + 1

  const label = STRATEGY_LABEL[canonical]
  const strategies = new Set<string>([...(asStringArray(e.total_strategies_used)), label])
  const areas = new Set<string>([...(asStringArray(e.preferred_postcode_areas)), district])

  // Risk appetite derived from strategy patterns.
  let riskAppetite = str(e, "risk_appetite") ?? "moderate"
  if (canonical === "dev" || canonical === "flip") {
    riskAppetite = "aggressive"
  } else if (strategies.size === 1 && canonical === "btl") {
    riskAppetite = "conservative"
  }

  const price = num(formData, "purchasePrice", "purchase_price")
  const currentMin = num(e, "typical_budget_min")
  const currentMax = num(e, "typical_budget_max")

  await supabase.from("user_investor_profiles").upsert(
    {
      user_id: userId,
      total_analyses: totalAnalyses,
      total_strategies_used: [...strategies],
      preferred_strategies: [...strategies],
      preferred_postcode_areas: [...areas].slice(-10), // keep last 10 areas
      typical_budget_min: currentMin !== null ? Math.min(currentMin, price ?? currentMin) : price,
      typical_budget_max: currentMax !== null ? Math.max(currentMax, price ?? currentMax) : price,
      typical_deposit_pct: num(formData, "deposit", "depositPercent") ?? num(e, "typical_deposit_pct"),
      typical_mortgage_rate: num(formData, "mortgageRate", "interestRate") ?? num(e, "typical_mortgage_rate"),
      risk_appetite: riskAppetite,
      most_active_area: district,
      avg_deal_score_analysed: runningMean(
        num(e, "avg_deal_score_analysed"),
        num(result, "dealScore", "deal_score") ?? 0,
        totalAnalyses,
      ),
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
}

// ── deal patterns ───────────────────────────────────────────────────────────
async function detectAndStorePatterns(
  supabase: Supa,
  district: string,
  area: string,
  canonical: Canonical,
  formData: Loose,
  result: Loose,
): Promise<void> {
  const label = STRATEGY_LABEL[canonical]
  const patterns: Loose[] = []
  const grossYield = num(result, "grossYield", "gross_yield")
  const article4 = result.article4 as Loose | undefined
  const article4Active =
    (article4 && str(article4, "status") === "active") || result.article4Active === true

  // Pattern 1: high HMO yield area
  if (canonical === "hmo" && grossYield !== null && grossYield > 9) {
    patterns.push({
      pattern_type: "high_hmo_yield_area",
      strategy: label,
      postcode_area: area,
      description: `HMO gross yields above 9% observed in ${area} postcode area`,
      insight: `${area} is showing strong HMO yields above platform average`,
      recommendation: `Consider HMO strategy for properties in ${area} area`,
      trigger_conditions: { strategy: "HMO", grossYield: { gt: 9 } },
    })
  }

  // Pattern 2: Article 4 risk for HMO investors
  if (canonical === "hmo" && article4Active) {
    patterns.push({
      pattern_type: "article4_hmo_risk",
      strategy: label,
      postcode_area: area,
      description: `HMO investments in ${area} require planning permission (Article 4 active)`,
      insight: `Investors in ${district} need planning consent for HMO conversion`,
      recommendation: `Budget extra £3,000-5,000 and 12+ weeks for HMO planning in ${area}`,
      trigger_conditions: { strategy: "HMO", article4: "active" },
    })
  }

  // Pattern 3: SA occupancy overestimate
  const enteredOcc = num(formData, "occupancyRate")
  const marketOcc = num((result.airroiMarket as Loose) ?? {}, "avgOccupancyRate")
  if (canonical === "sa" && enteredOcc !== null && enteredOcc > 75 && marketOcc !== null && enteredOcc > marketOcc * 1.2) {
    patterns.push({
      pattern_type: "sa_occupancy_overestimate",
      strategy: label,
      postcode_area: area,
      description: `SA investors in ${area} frequently overestimate occupancy`,
      insight: `Market average occupancy in ${area} is ${marketOcc}% but investors assume ${enteredOcc}%`,
      recommendation: `Use ${Math.round(marketOcc)}% as base occupancy for SA deals in ${area}`,
      trigger_conditions: { strategy: "SA", area },
    })
  }

  // Pattern 4: strong BRRRR capital recycling
  const recovered = num(result, "capitalRecoveredPct", "capital_recovered_pct")
  if (canonical === "brrrr" && recovered !== null && recovered > 80) {
    patterns.push({
      pattern_type: "strong_brrrr_recycling",
      strategy: label,
      postcode_area: area,
      description: `BRRRR deals in ${area} showing strong capital recycling (80%+)`,
      insight: `Property values in ${district} are responding well to refurbishment uplift`,
      recommendation: `${area} area is supporting good BRRRR capital recycling`,
      trigger_conditions: { strategy: "BRRRR", capitalRecoveredPct: { gt: 80 } },
    })
  }

  for (const pattern of patterns) {
    const { data: existing } = await supabase
      .from("deal_patterns")
      .select("id, frequency")
      .eq("pattern_type", pattern.pattern_type as string)
      .eq("postcode_area", area)
      .eq("strategy", label)
      .maybeSingle()

    if (existing) {
      const freq = (num(existing as Loose, "frequency") ?? 1) + 1
      await supabase
        .from("deal_patterns")
        .update({
          frequency: freq,
          confidence: Math.min(0.95, freq / 20), // grows with frequency, max 95%
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as Loose).id as string)
    } else {
      await supabase.from("deal_patterns").insert(pattern)
    }
  }
}

// ── platform benchmarks ─────────────────────────────────────────────────────
async function updatePlatformBenchmarks(supabase: Supa, canonical: Canonical, result: Loose): Promise<void> {
  const grossYield = num(result, "grossYield", "gross_yield")
  if (grossYield === null || grossYield <= 0) return

  const label = STRATEGY_LABEL[canonical]
  const metricName = `${label}_gross_yield`

  const { data: current } = await supabase
    .from("platform_benchmarks")
    .select("*")
    .eq("metric_name", metricName)
    .maybeSingle()

  const sampleSize = (num((current as Loose) ?? {}, "sample_size") ?? 0) + 1
  const newAvg = runningMean(num((current as Loose) ?? {}, "metric_value"), grossYield, sampleSize)

  await supabase.from("platform_benchmarks").upsert(
    {
      metric_name: metricName,
      metric_value: newAvg,
      metric_type: "yield",
      strategy: label,
      sample_size: sampleSize,
      last_calculated: new Date().toISOString(),
    },
    { onConflict: "metric_name" },
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}
