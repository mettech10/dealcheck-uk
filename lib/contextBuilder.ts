/**
 * Metalyzi Context Builder (Section 4)
 * ====================================
 *
 * Pulls the right slice of accumulated intelligence to inject into an AI call.
 * Returns a MetalyziContext (consumed by the AI gateway's injectContext).
 *
 * Injection gates (per the build's general rules):
 *  - Area intelligence is only included when confidence_level is 'medium' or
 *    'high' (i.e. 10+ deals in the area) — small samples aren't trustworthy.
 *  - The user profile is only included after 3+ analyses.
 *  - Patterns are pre-filtered to confidence >= 0.3, top 3 by frequency.
 *
 * Never throws: every query is wrapped (Promise.allSettled) and any failure
 * just omits that slice, so a context-builder problem can never break the AI
 * call. Uses the service-role admin client (the intelligence tables are
 * service-role only).
 */
import { createAdminClient } from "@/lib/supabase/admin"
import type { MetalyziContext } from "@/lib/aiGateway"

type Loose = Record<string, unknown>

// Mirrors intelligencePipeline.ts — maps any strategy id to the uppercase
// label the pipeline stores in deal_patterns.strategy / platform_benchmarks.
function strategyLabel(s: string): string | null {
  switch ((s || "").toLowerCase()) {
    case "btl":
      return "BTL"
    case "hmo":
      return "HMO"
    case "brr":
    case "brrrr":
      return "BRRRR"
    case "r2sa":
    case "sa":
      return "SA"
    case "flip":
      return "FLIP"
    case "development":
    case "dev":
      return "DEV"
    default:
      return null
  }
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

export async function buildContext(
  postcode: string,
  userId: string,
  strategy: string,
): Promise<MetalyziContext> {
  const district = (postcode || "").split(" ")[0].toUpperCase()
  const area = district.replace(/[0-9]/g, "")
  const label = strategyLabel(strategy)
  const context: MetalyziContext = {}
  if (!district) return context

  const supabase = createAdminClient()

  const [areaRes, profileRes, patternRes, benchRes] = await Promise.allSettled([
    supabase.from("area_intelligence").select("*").eq("postcode_district", district).maybeSingle(),
    supabase.from("user_investor_profiles").select("*").eq("user_id", userId).maybeSingle(),
    label
      ? supabase
          .from("deal_patterns")
          .select("*")
          .eq("postcode_area", area)
          .eq("strategy", label)
          .eq("active", true)
          .gte("confidence", 0.3)
          .order("frequency", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as Loose[] }),
    // National BTL + HMO yields — NOT filtered by the current strategy.
    supabase
      .from("platform_benchmarks")
      .select("*")
      .in("metric_name", ["BTL_gross_yield", "HMO_gross_yield"]),
  ])

  // ── Area intelligence (gated by confidence) ──────────────────────────────
  if (areaRes.status === "fulfilled" && areaRes.value.data) {
    const d = areaRes.value.data as Loose
    const confidence = typeof d.confidence_level === "string" ? d.confidence_level : "low"
    if (confidence === "medium" || confidence === "high") {
      context.areaDeals = {
        dealCount: toNum(d.deal_count) ?? 0,
        medianBtlYield: toNum(d.median_btl_gross_yield),
        medianHmoYield: toNum(d.median_hmo_gross_yield),
        observedVoidRate: toNum(d.avg_void_weeks_entered),
        observedSaOccupancy: null, // not tracked directly on area_intelligence
        dominantStrategy: typeof d.dominant_strategy === "string" ? d.dominant_strategy : null,
      }
    }
  }

  // ── User profile (gated by 3+ analyses) ──────────────────────────────────
  if (profileRes.status === "fulfilled" && profileRes.value.data) {
    const u = profileRes.value.data as Loose
    if ((toNum(u.total_analyses) ?? 0) >= 3) {
      context.userProfile = {
        preferredStrategies: toStrArray(u.preferred_strategies),
        preferredAreas: toStrArray(u.preferred_postcode_areas),
        typicalBudgetMin: toNum(u.typical_budget_min),
        typicalBudgetMax: toNum(u.typical_budget_max),
        riskAppetite: typeof u.risk_appetite === "string" ? u.risk_appetite : "moderate",
        totalAnalyses: toNum(u.total_analyses) ?? 0,
      }
    }
  }

  // ── Relevant patterns ────────────────────────────────────────────────────
  if (patternRes.status === "fulfilled" && Array.isArray(patternRes.value.data)) {
    const rows = patternRes.value.data as Loose[]
    if (rows.length > 0) {
      context.relevantPatterns = rows.map((p) => ({
        description: typeof p.description === "string" ? p.description : "",
        frequency: toNum(p.frequency) ?? 1,
        insight: typeof p.insight === "string" ? p.insight : undefined,
        recommendation: typeof p.recommendation === "string" ? p.recommendation : undefined,
      }))
    }
  }

  // ── Platform benchmarks ──────────────────────────────────────────────────
  if (benchRes.status === "fulfilled" && Array.isArray(benchRes.value.data)) {
    const rows = benchRes.value.data as Loose[]
    const btl = rows.find((b) => b.metric_name === "BTL_gross_yield")
    const hmo = rows.find((b) => b.metric_name === "HMO_gross_yield")
    if (btl || hmo) {
      context.platformBenchmarks = {
        nationalBtlYield: btl ? toNum(btl.metric_value) : null,
        nationalHmoYield: hmo ? toNum(hmo.metric_value) : null,
        totalDeals: toNum(btl?.sample_size) ?? toNum(hmo?.sample_size) ?? 0,
        positiveCashflowPct: null, // not yet tracked as a benchmark
      }
    }
  }

  return context
}
