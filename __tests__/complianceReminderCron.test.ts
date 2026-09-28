import { describe, expect, test, vi } from "vitest"
import { complianceCronSecret, runComplianceReminderDispatch } from "@/lib/compliance/reminderCron"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("compliance reminder cron", () => {
  test("prefers COMPLIANCE_CRON_SECRET, falls back to BENCHMARK_CRON_SECRET", () => {
    expect(complianceCronSecret({ COMPLIANCE_CRON_SECRET: "c", BENCHMARK_CRON_SECRET: "b" })).toBe("c")
    expect(complianceCronSecret({ BENCHMARK_CRON_SECRET: "b" })).toBe("b")
    expect(complianceCronSecret({})).toBe("")
  })

  test("fails loudly without a secret and never calls Flask", async () => {
    const fetchImpl = vi.fn()
    const r = await runComplianceReminderDispatch({ env: {}, fetchImpl })
    expect(r.status).toBe(500)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test("posts to Flask dispatch with the cron secret and summarises results", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        asOf: "2026-09-28",
        due: 3,
        dispatched: [{ status: "sent" }, { status: "sent" }, { status: "skipped" }],
        queuedWeekly: [{ offsetCode: "overdue_weekly" }],
        email: { configured: true },
      }),
    )
    const r = await runComplianceReminderDispatch({
      env: { BENCHMARK_CRON_SECRET: "s3cret", NEXT_PUBLIC_ANALYZER_API_URL: "https://flask.test/" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://flask.test/v1/compliance/reminders/dispatch")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["X-Cron-Secret"]).toBe("s3cret")
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, due: 3, byStatus: { sent: 2, skipped: 1 }, queuedWeekly: 1 })
  })

  test("dry run passes through and reports what would be sent", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        dryRun: true,
        due: 2,
        wouldDispatch: [
          { id: "r1", obligationId: "ob-1", offsetCode: "overdue" },
          { id: "r2", obligationId: "ob-2", offsetCode: "t_minus_30" },
        ],
      }),
    )
    const r = await runComplianceReminderDispatch({
      dryRun: true,
      env: { BENCHMARK_CRON_SECRET: "s" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toMatch(/\/reminders\/dispatch\?dryRun=1$/)
    expect(r.body).toMatchObject({
      ok: true,
      dryRun: true,
      due: 2,
      wouldDispatchByOffset: { overdue: 1, t_minus_30: 1 },
    })
    // Public route: no ids leak through.
    expect(JSON.stringify(r.body)).not.toMatch(/r1|ob-1/)
  })

  test("a rejected secret is reported as a wiring problem, not success", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { success: false, message: "Unauthorized" }))
    const r = await runComplianceReminderDispatch({
      env: { BENCHMARK_CRON_SECRET: "wrong" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.status).toBe(502)
    expect(String(r.body.error)).toMatch(/rejected the cron secret/)
  })

  test("network failure is a 502 naming the analyzer", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET")
    })
    const r = await runComplianceReminderDispatch({
      env: { BENCHMARK_CRON_SECRET: "s" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.status).toBe(502)
    expect(r.body.analyzer).toBe("https://metusa-deal-analyzer.onrender.com")
  })
})
