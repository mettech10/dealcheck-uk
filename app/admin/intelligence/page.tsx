/**
 * Admin → Intelligence (Section 6)
 * ================================
 *
 * Shows what the platform has learned: the proprietary intelligence layer.
 * Already gated by app/admin/layout.tsx (auth + isAdminEmail), so this is a
 * plain server component that reads the four intelligence tables with the
 * service-role admin client.
 *
 * The "Model Sovereignty" panel proves the core point — the accumulated
 * intelligence above is independent of whichever AI model is configured.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

type Row = Record<string, unknown>

function n(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}
function pct(v: unknown): string {
  const x = n(v)
  return x === null ? "—" : `${x.toFixed(1)}%`
}

async function loadIntelligence() {
  const admin = createAdminClient()
  const empty = {
    areas: [] as Row[],
    patterns: [] as Row[],
    totalAnalyses: 0,
    areaCount: 0,
    patternCount: 0,
    profileCount: 0,
  }
  try {
    const [areasRes, allDealRes, patternsRes, patternCountRes, profileCountRes] = await Promise.all([
      admin
        .from("area_intelligence")
        .select("postcode_district, deal_count, median_btl_gross_yield, median_hmo_gross_yield, dominant_strategy, confidence_level")
        .order("deal_count", { ascending: false })
        .limit(50),
      admin.from("area_intelligence").select("deal_count"),
      admin
        .from("deal_patterns")
        .select("pattern_type, postcode_area, strategy, frequency, confidence")
        .eq("active", true)
        .order("frequency", { ascending: false })
        .limit(20),
      admin.from("deal_patterns").select("id", { count: "exact", head: true }).eq("active", true),
      admin.from("user_investor_profiles").select("id", { count: "exact", head: true }),
    ])
    const areas = (areasRes.data as Row[]) ?? []
    const totalAnalyses = ((allDealRes.data as Row[]) ?? []).reduce((s, r) => s + (n(r.deal_count) ?? 0), 0)
    return {
      areas,
      patterns: (patternsRes.data as Row[]) ?? [],
      totalAnalyses,
      areaCount: areas.length >= 50 ? (((allDealRes.data as Row[]) ?? []).length) : areas.length,
      patternCount: patternCountRes.count ?? 0,
      profileCount: profileCountRes.count ?? 0,
    }
  } catch {
    return empty
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E] p-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  )
}

export default async function IntelligencePage() {
  const data = await loadIntelligence()
  const provider = process.env.AI_PROVIDER ?? "anthropic"
  const model = process.env.AI_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Platform Intelligence</h1>
        <p className="mt-1 text-sm text-slate-400">
          What Metalyzi has learned across every analysis — owned by Metusa Property Ltd, independent of the AI model.
        </p>
      </header>

      {/* Platform overview */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total analyses recorded" value={data.totalAnalyses.toLocaleString()} />
        <Stat label="Areas with intelligence" value={data.areaCount.toLocaleString()} />
        <Stat label="Active deal patterns" value={data.patternCount.toLocaleString()} />
        <Stat label="User profiles built" value={data.profileCount.toLocaleString()} />
        <Stat label="Model provider" value={provider} />
      </section>

      {/* Area intelligence */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
        <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
          Area Intelligence
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">District</th>
                <th className="px-4 py-2 font-medium">Deals</th>
                <th className="px-4 py-2 font-medium">BTL Yield</th>
                <th className="px-4 py-2 font-medium">HMO Yield</th>
                <th className="px-4 py-2 font-medium">Dominant Strategy</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.areas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No area intelligence yet — it accumulates as analyses run.
                  </td>
                </tr>
              ) : (
                data.areas.map((a, i) => (
                  <tr key={i} className="border-t border-[#2A2D3E] text-slate-200">
                    <td className="px-4 py-2 font-mono">{String(a.postcode_district ?? "—")}</td>
                    <td className="px-4 py-2">{n(a.deal_count) ?? 0}</td>
                    <td className="px-4 py-2">{pct(a.median_btl_gross_yield)}</td>
                    <td className="px-4 py-2">{pct(a.median_hmo_gross_yield)}</td>
                    <td className="px-4 py-2">{String(a.dominant_strategy ?? "—")}</td>
                    <td className="px-4 py-2 capitalize">{String(a.confidence_level ?? "low")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top patterns */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E]">
        <div className="border-b border-[#2A2D3E] px-4 py-3 text-sm font-semibold text-white">
          Top Patterns Discovered
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">Pattern</th>
                <th className="px-4 py-2 font-medium">Strategy</th>
                <th className="px-4 py-2 font-medium">Area</th>
                <th className="px-4 py-2 font-medium">Frequency</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.patterns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No patterns discovered yet.
                  </td>
                </tr>
              ) : (
                data.patterns.map((p, i) => (
                  <tr key={i} className="border-t border-[#2A2D3E] text-slate-200">
                    <td className="px-4 py-2">{String(p.pattern_type ?? "—")}</td>
                    <td className="px-4 py-2">{String(p.strategy ?? "—")}</td>
                    <td className="px-4 py-2 font-mono">{String(p.postcode_area ?? "—")}</td>
                    <td className="px-4 py-2">{n(p.frequency) ?? 0}</td>
                    <td className="px-4 py-2">{(n(p.confidence) ?? 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Model sovereignty */}
      <section className="rounded-lg border border-[#2A2D3E] bg-[#1A1D2E] p-4">
        <div className="text-sm font-semibold text-white">Model Sovereignty</div>
        <p className="mt-1 text-xs text-slate-400">
          The intelligence above belongs to Metalyzi and is independent of the model. Switch the model platform-wide by
          changing one environment variable — every analysis uses the new model and all intelligence is preserved.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-[#2A2D3E] bg-[#13151F] px-3 py-2">
            <div className="text-xs text-slate-400">Current provider</div>
            <div className="font-mono text-sm text-white">{provider}</div>
          </div>
          <div className="rounded-md border border-[#2A2D3E] bg-[#13151F] px-3 py-2">
            <div className="text-xs text-slate-400">Current model</div>
            <div className="font-mono text-sm text-white">{model}</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          To switch: set <span className="font-mono text-slate-300">AI_PROVIDER</span> /{" "}
          <span className="font-mono text-slate-300">AI_MODEL</span> in the Vercel and Render environments and redeploy
          (e.g. <span className="font-mono text-slate-300">AI_MODEL=claude-opus-4-8</span>). The{" "}
          <span className="font-mono text-slate-300">openai</span> provider is reserved but not yet implemented.
        </p>
      </section>
    </div>
  )
}
