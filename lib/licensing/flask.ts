/**
 * Thin Flask client for POST /v1/licensing/check.
 *
 * Canonical engine: metusa-deal-analyzer (BE PR #94). Next must not
 * compute licensing locally — this module only forwards JSON.
 */

const DEFAULT_ANALYZER_URL = "https://metusa-deal-analyzer.onrender.com"

export function analyzerApiUrl(): string {
  const raw =
    process.env.ANALYZER_API_URL?.trim() ||
    process.env.BACKEND_API_URL?.trim() ||
    DEFAULT_ANALYZER_URL
  return raw.replace(/\/+$/, "")
}

export function analyzerApiToken(): string | null {
  const token =
    process.env.ANALYZER_API_TOKEN?.trim() ||
    process.env.BACKEND_API_TOKEN?.trim() ||
    process.env.ANALYZER_API_KEY?.trim() ||
    ""
  return token || null
}

export function licensingCheckUrl(): string {
  return `${analyzerApiUrl()}/v1/licensing/check`
}

export function analyzerAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }
  const token = analyzerApiToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export class FlaskLicensingError extends Error {
  readonly status: number
  readonly code: string | null
  readonly disclaimer: string | null
  readonly body: unknown

  constructor(
    message: string,
    opts: { status: number; code?: string | null; disclaimer?: string | null; body?: unknown },
  ) {
    super(message)
    this.name = "FlaskLicensingError"
    this.status = opts.status
    this.code = opts.code ?? null
    this.disclaimer = opts.disclaimer ?? null
    this.body = opts.body
  }
}

export async function postLicensingCheck(
  body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const url = licensingCheckUrl()
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: analyzerAuthHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new FlaskLicensingError(`Analyzer licensing check unreachable (${msg})`, {
      status: 502,
      code: "analyzer_unreachable",
    })
  }

  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    throw new FlaskLicensingError("Analyzer licensing check returned a non-JSON body", {
      status: res.status,
      code: "invalid_upstream_json",
    })
  }

  return { status: res.status, json }
}
