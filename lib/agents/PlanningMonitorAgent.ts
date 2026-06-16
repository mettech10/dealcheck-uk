/**
 * PlanningMonitorAgent (Section 3) — watches councils for new Article 4 moves.
 *
 * Weekly, it visits each council's planning page and looks for signals that an
 * Article 4 direction is being consulted on / proposed. If it finds one for a
 * council we currently track as 'none', it upgrades that row to 'proposed'
 * (verified: false) and emails the admin to verify manually.
 *
 * Safety rules (from the spec):
 *  - It only ever moves a row from 'none' → 'proposed'. It NEVER sets a row to
 *    'active' (an active Article 4 has legal force and must be confirmed by a
 *    human) and never downgrades an existing 'active'/'proposed' row.
 *  - Every council is wrapped in its own try/catch so one bad page can't crash
 *    the run, and there's a 2s pause + a Metalyzi bot User-Agent between fetches.
 */
import { BaseAgent, type AgentResult } from "./BaseAgent"

const USER_AGENT = "Metalyzi Property Intelligence Bot 1.0 (+https://metalyzi.co.uk)"

/** Phrases that, alongside "article 4", indicate a live/forthcoming direction. */
const CONSULTATION_SIGNALS = [
  "consultation",
  "proposed direction",
  "public notice",
  "non-immediate direction",
  "draft direction",
]

interface CouncilRow {
  id: string
  council_name: string
  status: string
  council_planning_url: string | null
  postcode_districts: string[] | null
}

export class PlanningMonitorAgent extends BaseAgent {
  constructor() {
    super("PlanningMonitorAgent", "0 6 * * 1") // 6am every Monday
  }

  async execute(): Promise<AgentResult> {
    const insights: string[] = []
    let processed = 0

    const { data: rows, error } = await this.supabase
      .from("article4_areas")
      .select("id, council_name, status, council_planning_url, postcode_districts")

    if (error) {
      throw new Error(`article4_areas read failed: ${error.message}`)
    }

    const councils = ((rows as CouncilRow[]) ?? []).filter((c) => !!c.council_planning_url)

    for (const council of councils) {
      try {
        const html = await this.fetchPage(council.council_planning_url as string)
        if (!html) continue

        const hasA4Consultation = this.detectArticle4Consultation(html)

        // Only act when we find a fresh signal for a council we don't yet flag.
        if (hasA4Consultation && council.status === "none") {
          await this.supabase
            .from("article4_areas")
            .update({
              status: "proposed",
              verified: false, // requires manual confirmation before it counts as active
              proposed_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            })
            .eq("id", council.id)

          const districts = (council.postcode_districts ?? []).join(", ") || "unknown districts"
          insights.push(
            `Possible new Article 4 consultation at ${council.council_name} (${districts}) — flagged 'proposed' for review.`,
          )
          await this.sendPlanningAlert(council, districts)
        }

        processed++
        await this.sleep(2000) // polite spacing between council fetches
      } catch (err) {
        console.warn(
          `[PlanningMonitorAgent] ${council.council_name}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    return { itemsProcessed: processed, insights }
  }

  /** Fetch a council page as text. Returns null on any non-OK / error. */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) return null
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("html") && !ct.includes("text")) return null
      return await res.text()
    } catch {
      return null
    }
  }

  /** True if the page mentions Article 4 alongside a consultation signal. */
  private detectArticle4Consultation(html: string): boolean {
    const text = html.toLowerCase()
    if (!text.includes("article 4")) return false
    return CONSULTATION_SIGNALS.some((s) => text.includes(s))
  }

  private async sendPlanningAlert(council: CouncilRow, districts: string): Promise<void> {
    const subject = `[Metalyzi] Possible new Article 4: ${council.council_name}`
    const html = `
      <h2>Article 4 signal detected</h2>
      <p>The Planning Monitor agent found Article 4 consultation language on a council planning page.</p>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td><strong>Council</strong></td><td>${escapeHtml(council.council_name)}</td></tr>
        <tr><td><strong>Districts</strong></td><td>${escapeHtml(districts)}</td></tr>
        <tr><td><strong>Source</strong></td><td><a href="${escapeAttr(
          council.council_planning_url ?? "",
        )}">${escapeHtml(council.council_planning_url ?? "")}</a></td></tr>
      </table>
      <p>This row has been moved to <strong>proposed</strong> (verified: false). It will
      <strong>not</strong> be treated as an active Article 4 until you confirm it manually
      in the admin and set <code>verified = true</code>.</p>
    `
    await this.sendAdminEmail(subject, html)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  )
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
