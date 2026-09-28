/**
 * Daily trigger for Flask's compliance reminder dispatch.
 *
 * Render has no free cron jobs, so the render.yaml dispatcher never ran.
 * Vercel's daily cron calls /api/cron/compliance-reminders, which calls
 * this. Flask authenticates with the same secret it uses for benchmarks.
 */

import { resolveComplianceAnalyzerUrl } from "./analyzerUrl"

type EnvMap = Record<string, string | undefined>

export interface ReminderCronResult {
  status: number
  body: Record<string, unknown>
}

/** Flask accepts COMPLIANCE_CRON_SECRET, falling back to BENCHMARK_CRON_SECRET. */
export function complianceCronSecret(env: EnvMap = process.env): string {
  return (env.COMPLIANCE_CRON_SECRET || env.BENCHMARK_CRON_SECRET || "").trim()
}

export async function runComplianceReminderDispatch(opts: {
  dryRun?: boolean
  env?: EnvMap
  fetchImpl?: typeof fetch
  timeoutMs?: number
} = {}): Promise<ReminderCronResult> {
  const env = opts.env ?? process.env
  const secret = complianceCronSecret(env)
  if (!secret) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "cron secret not configured",
        detail: "Set COMPLIANCE_CRON_SECRET or BENCHMARK_CRON_SECRET to the value Flask uses.",
      },
    }
  }

  const origin = resolveComplianceAnalyzerUrl(env)
  const url = `${origin}/v1/compliance/reminders/dispatch${opts.dryRun ? "?dryRun=1" : ""}`
  const doFetch = opts.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "X-Cron-Secret": secret, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
      // Render free instances can take ~60s to wake.
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    })
  } catch (err) {
    return {
      status: 502,
      body: {
        ok: false,
        error: "compliance analyzer unreachable",
        analyzer: origin,
        detail: err instanceof Error ? err.message : String(err),
      },
    }
  }

  const upstream = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return {
      status: res.status === 401 ? 502 : res.status,
      body: {
        ok: false,
        error:
          res.status === 401
            ? "Flask rejected the cron secret (check COMPLIANCE_CRON_SECRET / BENCHMARK_CRON_SECRET match on Vercel and Render)"
            : "dispatch failed",
        upstreamStatus: res.status,
        upstream,
      },
    }
  }

  // Counts only: the route may be reachable without CRON_SECRET, so never
  // echo reminder / obligation ids or user data from Flask.
  const countBy = (rows: unknown, key: "status" | "offsetCode") => {
    const out: Record<string, number> = {}
    for (const row of (Array.isArray(rows) ? rows : []) as Array<Record<string, unknown>>) {
      const k = String(row[key] ?? "unknown")
      out[k] = (out[k] ?? 0) + 1
    }
    return out
  }
  return {
    status: 200,
    body: {
      ok: true,
      dryRun: Boolean(upstream.dryRun),
      asOf: upstream.asOf,
      due: upstream.due,
      byStatus: countBy(upstream.dispatched, "status"),
      wouldDispatchByOffset: upstream.dryRun ? countBy(upstream.wouldDispatch, "offsetCode") : undefined,
      queuedWeekly: Array.isArray(upstream.queuedWeekly) ? upstream.queuedWeekly.length : 0,
      emailConfigured: (upstream.email as { configured?: boolean } | undefined)?.configured ?? null,
    },
  }
}
