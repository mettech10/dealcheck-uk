/**
 * BaseAgent — foundation for Metalyzi's self-learning agents (Section 1).
 *
 * Each agent runs on a schedule (Render cron → POST /api/agents/<name>) and
 * updates the intelligence database with no user involved. run() wraps
 * execute() so an agent can NEVER crash the platform: every failure is caught,
 * logged to agent_run_log, and returned as a structured result.
 *
 * Adaptations from the spec (to fit this codebase):
 *  - lib/agents/ (not src/agents/); Supabase via the project's
 *    createAdminClient() (service-role), created lazily so agents can be
 *    constructed at import time without env.
 *  - Shared helpers live here (sleep, recordPattern, sendAdminEmail) rather
 *    than being duplicated across agents. recordPattern uses SELECT-then-write
 *    because deal_patterns has no unique constraint (and supports null
 *    strategy for platform-wide signals).
 *  - agent_run_log columns are snake_case (duration_ms, items_processed).
 */
import { createAdminClient } from "@/lib/supabase/admin"

export interface AgentResult {
  itemsProcessed: number
  insights: string[]
  error?: string
}

interface AgentRunLog {
  agent: string
  status: "success" | "error"
  duration: number
  itemsProcessed: number
  insights: string[]
  errors: string[]
}

type Supa = ReturnType<typeof createAdminClient>

export abstract class BaseAgent {
  name: string
  schedule: string // cron expression
  lastRun: Date | null = null

  private _supabase?: Supa

  constructor(name: string, schedule: string) {
    this.name = name
    this.schedule = schedule
  }

  /** Lazy service-role client — created on first use, never at construction. */
  protected get supabase(): Supa {
    return (this._supabase ??= createAdminClient())
  }

  async run(): Promise<AgentResult> {
    const startTime = Date.now()
    console.log(`[${this.name}] Starting run at ${new Date().toISOString()}`)

    try {
      const result = await this.execute()
      const duration = Date.now() - startTime
      await this.logRun({
        agent: this.name,
        status: "success",
        duration,
        itemsProcessed: result.itemsProcessed,
        insights: result.insights,
        errors: [],
      })
      console.log(`[${this.name}] Completed in ${duration}ms. Processed: ${result.itemsProcessed}`)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[${this.name}] Failed:`, message)
      await this.logRun({
        agent: this.name,
        status: "error",
        duration: Date.now() - startTime,
        itemsProcessed: 0,
        insights: [],
        errors: [message],
      })
      return { itemsProcessed: 0, insights: [], error: message }
    }
  }

  /** Each agent implements its own work here. */
  abstract execute(): Promise<AgentResult>

  // ── Shared helpers ──────────────────────────────────────────────────────

  /** Polite delay between external requests. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Upsert a deal pattern by its (pattern_type, postcode_area, strategy)
   * identity — increments frequency + confidence if it already exists.
   * SELECT-then-write because deal_patterns has no unique constraint, and
   * strategy may be null (platform-wide signals).
   */
  protected async recordPattern(p: {
    pattern_type: string
    strategy: string | null
    postcode_area: string
    description?: string
    insight?: string
    recommendation?: string
    trigger_conditions?: unknown
    confidence?: number
  }): Promise<void> {
    const supabase = this.supabase
    let query = supabase
      .from("deal_patterns")
      .select("id, frequency")
      .eq("pattern_type", p.pattern_type)
      .eq("postcode_area", p.postcode_area)
    query = p.strategy === null ? query.is("strategy", null) : query.eq("strategy", p.strategy)
    const { data: existing } = await query.maybeSingle()

    if (existing) {
      const row = existing as { id: string; frequency: number | null }
      const freq = (row.frequency ?? 1) + 1
      const patch: Record<string, unknown> = {
        frequency: freq,
        confidence: Math.min(0.95, p.confidence ?? freq / 20),
        updated_at: new Date().toISOString(),
      }
      // Refresh the human-readable fields when the caller supplies fresh ones
      // (e.g. the latest rate move / rent change), but leave them untouched
      // when omitted.
      if (p.description !== undefined) patch.description = p.description
      if (p.insight !== undefined) patch.insight = p.insight
      if (p.recommendation !== undefined) patch.recommendation = p.recommendation
      if (p.trigger_conditions !== undefined) patch.trigger_conditions = p.trigger_conditions
      await supabase.from("deal_patterns").update(patch).eq("id", row.id)
    } else {
      await supabase.from("deal_patterns").insert({
        pattern_type: p.pattern_type,
        strategy: p.strategy,
        postcode_area: p.postcode_area,
        description: p.description ?? null,
        insight: p.insight ?? null,
        recommendation: p.recommendation ?? null,
        trigger_conditions: p.trigger_conditions ?? null,
        frequency: 1,
        confidence: p.confidence ?? 0.5,
        active: true,
      })
    }
  }

  /**
   * Send an admin alert via Brevo. Fire-and-forget safe: silently no-ops if
   * BREVO_API_KEY is unset and never throws into the agent run.
   */
  protected async sendAdminEmail(subject: string, htmlContent: string): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY
    if (!apiKey) return
    const to = process.env.ADMIN_ALERT_EMAIL || "contact@metalyzi.co.uk"
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@metalyzi.co.uk"
    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          sender: { name: "Metalyzi Intelligence", email: senderEmail },
          to: [{ email: to }],
          subject,
          htmlContent,
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (e) {
      console.warn(`[${this.name}] admin email failed:`, e instanceof Error ? e.message : e)
    }
  }

  // ── Run logging ─────────────────────────────────────────────────────────
  private async logRun(log: AgentRunLog): Promise<void> {
    try {
      await this.supabase.from("agent_run_log").insert({
        agent: log.agent,
        status: log.status,
        duration_ms: log.duration,
        items_processed: log.itemsProcessed,
        insights: log.insights,
        errors: log.errors,
      })
    } catch (e) {
      // Logging must never break a run.
      console.warn(`[${this.name}] agent_run_log insert failed:`, e instanceof Error ? e.message : e)
    }
  }
}
