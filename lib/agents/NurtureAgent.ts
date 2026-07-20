/**
 * NurtureAgent (Section 5) — advances masterclass leads through the
 * 5-email sequence. Runs daily at 10am via the cron route
 * (POST /api/agents/nurture).
 *
 * Stage model: nurture_stage = the last email SENT (1 = welcome, sent by
 * the capture API). Each daily run finds leads whose stage is due for the
 * next email based on days since created_at:
 *   stage 1 → email 2 on day 2, stage 2 → email 3 on day 4,
 *   stage 3 → email 4 on day 7, stage 4 → email 5 on day 12.
 *
 * Hard rules from the spec:
 *   - unsubscribed leads are never touched (legal requirement);
 *   - the sequence stops the moment a lead signs up (signed_up = true);
 *   - stage only advances when Brevo confirms the send, so a failed send
 *     retries on the next daily run instead of silently skipping an email.
 */
import { BaseAgent, type AgentResult } from "./BaseAgent"
import { sendNurtureEmail } from "@/lib/masterclass-email"

const SCHEDULE = [
  { stage: 1, daysAfter: 2, next: 2 },
  { stage: 2, daysAfter: 4, next: 3 },
  { stage: 3, daysAfter: 7, next: 4 },
  { stage: 4, daysAfter: 12, next: 5 },
] as const

interface Lead {
  id: string
  email: string
  first_name: string | null
  main_strategy: string | null
}

export class NurtureAgent extends BaseAgent {
  constructor() {
    super("NurtureAgent", "0 10 * * *") // 10am daily
  }

  async execute(): Promise<AgentResult> {
    const insights: string[] = []
    let processed = 0
    let failed = 0

    for (const step of SCHEDULE) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - step.daysAfter)

      const { data: leads, error } = await this.supabase
        .from("masterclass_leads")
        .select("id, email, first_name, main_strategy")
        .eq("nurture_stage", step.stage)
        .eq("unsubscribed", false)
        .eq("signed_up", false) // stop nurturing once they sign up
        .lte("created_at", cutoff.toISOString())
        .limit(200) // safety cap per stage per run

      if (error) {
        insights.push(`stage ${step.stage} query failed: ${error.message}`)
        continue
      }

      for (const lead of (leads ?? []) as Lead[]) {
        const sent = await sendNurtureEmail(lead, step.next).catch((err) => {
          console.error(`[NurtureAgent] send failed for ${lead.email}:`, err)
          return false
        })

        if (!sent) {
          failed++
          continue // stage untouched → retried tomorrow
        }

        await this.supabase
          .from("masterclass_leads")
          .update({
            nurture_stage: step.next,
            last_email_sent: new Date().toISOString(),
          })
          .eq("id", lead.id)

        processed++
        await this.sleep(150) // stay polite to Brevo's rate limits
      }

      if (leads?.length) {
        insights.push(`stage ${step.stage} → ${step.next}: ${leads.length} due`)
      }
    }

    if (failed > 0) insights.push(`${failed} sends failed (will retry next run)`)
    if (processed > 0) insights.push(`sent ${processed} nurture emails`)

    return { itemsProcessed: processed, insights }
  }
}
