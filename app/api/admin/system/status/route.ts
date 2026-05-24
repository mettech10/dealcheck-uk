/**
 * GET /api/admin/system/status
 *
 * Pings every external service the platform depends on and returns
 * status + latency for each. Admin-gated.
 *
 * Each probe runs in parallel with its own short timeout (3s) so a
 * single slow upstream can't pin the request. Anything > 3s is
 * reported as "slow", > 6s as "down". Network failures and HTTP
 * 5xx → down. Missing config (no env var) → unconfigured.
 *
 * No third-party SDK calls — only HEAD/GET against well-known
 * health-equivalent URLs. Cheap, no quota usage.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"

export const dynamic = "force-dynamic"

type ServiceStatus = "ok" | "slow" | "down" | "unconfigured"

interface ProbeResult {
  service: string
  status: ServiceStatus
  latencyMs: number | null
  message: string
  checkedAt: string
}

const TIMEOUT_MS = 3000
const SLOW_THRESHOLD_MS = 3000

/**
 * Wrap fetch with an AbortController-driven timeout. The default
 * fetch doesn't honour signal.timeout in all runtimes; this version
 * is explicit + portable.
 */
async function pingFetch(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; ms: number; error?: string }> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const ms = Date.now() - t0
    return { ok: res.ok, status: res.status, ms }
  } catch (e) {
    const ms = Date.now() - t0
    return {
      ok: false,
      status: 0,
      ms,
      error: e instanceof Error ? e.message : "unknown",
    }
  } finally {
    clearTimeout(id)
  }
}

function classify(
  configured: boolean,
  ok: boolean,
  ms: number,
  message: string,
): Omit<ProbeResult, "service" | "checkedAt"> {
  if (!configured) return { status: "unconfigured", latencyMs: null, message }
  if (!ok) return { status: "down", latencyMs: ms, message }
  if (ms >= SLOW_THRESHOLD_MS)
    return { status: "slow", latencyMs: ms, message: `${ms}ms` }
  return { status: "ok", latencyMs: ms, message: `${ms}ms` }
}

async function probeSupabase(): Promise<ProbeResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return {
      service: "Supabase",
      ...classify(false, false, 0, "SUPABASE_URL or ANON_KEY not set"),
      checkedAt: new Date().toISOString(),
    }
  }
  const r = await pingFetch(`${url}/auth/v1/health`, {
    headers: { apikey: key },
  })
  return {
    service: "Supabase",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

async function probeFlask(): Promise<ProbeResult> {
  const base = process.env.BACKEND_API_URL
  if (!base) {
    return {
      service: "Flask Backend",
      ...classify(false, false, 0, "BACKEND_API_URL not set"),
      checkedAt: new Date().toISOString(),
    }
  }
  const r = await pingFetch(`${base}/api/health`)
  return {
    service: "Flask Backend",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

async function probeStripe(): Promise<ProbeResult> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return {
      service: "Stripe",
      ...classify(false, false, 0, "STRIPE_SECRET_KEY not set"),
      checkedAt: new Date().toISOString(),
    }
  }
  // Cheapest authenticated probe: GET /v1/balance returns 200 OK
  // for any valid key + 401 for a bad one. Doesn't list anything.
  const r = await pingFetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${key}` },
  })
  return {
    service: "Stripe",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

async function probeAnthropic(): Promise<ProbeResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return {
      service: "Anthropic API",
      ...classify(false, false, 0, "ANTHROPIC_API_KEY not set"),
      checkedAt: new Date().toISOString(),
    }
  }
  // Anthropic exposes no auth-free health endpoint; GET /v1/models
  // with the key is the standard liveness probe.
  const r = await pingFetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
  })
  return {
    service: "Anthropic API",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

async function probeBrevo(): Promise<ProbeResult> {
  const key = process.env.BREVO_API_KEY
  if (!key) {
    return {
      service: "Brevo Email",
      ...classify(false, false, 0, "BREVO_API_KEY not set"),
      checkedAt: new Date().toISOString(),
    }
  }
  const r = await pingFetch("https://api.brevo.com/v3/account", {
    headers: { "api-key": key },
  })
  return {
    service: "Brevo Email",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

async function probePropertyData(): Promise<ProbeResult> {
  const key = process.env.PROPERTYDATA_API_KEY
  if (!key) {
    return {
      service: "PropertyData",
      ...classify(false, false, 0, "PROPERTYDATA_API_KEY not set"),
      checkedAt: new Date().toISOString(),
    }
  }
  // Real endpoint the app uses (property_data.py _make_request).
  // valuation-rent is the cheapest real call; needs a valid postcode
  // + bedrooms. SW1A 1AA is well-formed and central. Consumes 1
  // credit per probe — accept the cost so the probe matches what
  // the app actually does at request time.
  const r = await pingFetch(
    `https://api.propertydata.co.uk/valuation-rent?key=${encodeURIComponent(key)}&postcode=SW1A1AA&bedrooms=2`,
  )
  return {
    service: "PropertyData",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

async function probeAirroi(): Promise<ProbeResult> {
  const key = process.env.AIRROI_API_KEY
  if (!key) {
    return {
      service: "Airroi API",
      ...classify(false, false, 0, "AIRROI_API_KEY not set"),
      checkedAt: new Date().toISOString(),
    }
  }
  // Real endpoint pattern from metusa-deal-analyzer/airroi_service.py:
  // base https://api.airroi.com + GET /markets/search?query=X with
  // header 'X-api-key' (note the capital X, lowercase rest — Airroi
  // is case-sensitive). 200 with results on a known city query.
  const r = await pingFetch(
    "https://api.airroi.com/markets/search?query=london",
    {
      headers: { "X-api-key": key, Accept: "application/json" },
    },
  )
  return {
    service: "Airroi API",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

async function probeEpc(): Promise<ProbeResult> {
  const email = process.env.EPC_API_EMAIL
  const key = process.env.EPC_API_KEY || process.env.EPC_API_TOKEN
  if (!email || !key) {
    const missing = [
      !email && "EPC_API_EMAIL",
      !key && "EPC_API_KEY",
    ]
      .filter(Boolean)
      .join(" + ")
    return {
      service: "EPC API",
      ...classify(false, false, 0, `${missing} not set`),
      checkedAt: new Date().toISOString(),
    }
  }
  // EPC opendatacommunities uses HTTP basic auth with `email:key`
  // — both halves are required. Previous probe sent ":key" which
  // is why it 401'd.
  const credentials = Buffer.from(`${email}:${key}`).toString("base64")
  const r = await pingFetch(
    "https://epc.opendatacommunities.org/api/v1/domestic/search?size=1",
    {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${credentials}`,
      },
    },
  )
  return {
    service: "EPC API",
    ...classify(true, r.ok, r.ms, r.error || `HTTP ${r.status}`),
    checkedAt: new Date().toISOString(),
  }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 })
  }

  const probes = await Promise.all([
    probeSupabase(),
    probeFlask(),
    probeStripe(),
    probeAnthropic(),
    probeBrevo(),
    probePropertyData(),
    probeAirroi(),
    probeEpc(),
  ])

  return NextResponse.json({ probes })
}
