/**
 * Thin proxy: POST /api/v1/deals → Flask POST /v1/deals
 *
 * Canonical deals SoT is the Flask backend (metusa-deal-analyzer PR #92).
 * This route does not persist screener_deals. It:
 *   - accepts Bearer (extension) or cookie session (session exchange)
 *   - maps aliases (sourceUrl, beds, monthlyRent) onto Flask field names
 *   - synthesises Idempotency-Key screener:{source}:{sourceListingId}
 *   - forwards to BACKEND_API_URL/v1/deals
 */

import { getAccessTokenFromRequest } from "@/lib/apiAuth"
import {
  SCHEMA_VERSION,
  buildHandoffRequest,
  parseHandoffResponse,
  resolveIdempotencyKey,
  toFlaskListing,
} from "@/lib/deal-screener"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"

export const dynamic = "force-dynamic"

const FLASK_URL =
  process.env.BACKEND_API_URL || "https://metusa-deal-analyzer.onrender.com"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function POST(req: Request) {
  const token = await getAccessTokenFromRequest(req)
  if (!token) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return screenerJson(req, { error: "Invalid JSON" }, 400)
  }

  const payload = (body ?? {}) as Record<string, unknown>
  if (payload.source != null && payload.source !== "screener") {
    return screenerJson(req, { error: "source must be 'screener'" }, 400)
  }
  if (payload.schemaVersion != null && payload.schemaVersion !== SCHEMA_VERSION) {
    return screenerJson(
      req,
      { error: `schemaVersion must be ${SCHEMA_VERSION}` },
      400,
    )
  }

  const listingRaw = payload.listing
  if (!listingRaw || typeof listingRaw !== "object") {
    return screenerJson(req, { error: "listing is required" }, 400)
  }

  let flaskBody
  try {
    flaskBody = buildHandoffRequest(
      listingRaw as Record<string, unknown>,
      typeof payload.strategyHint === "string" ? payload.strategyHint : "",
    )
  } catch (err) {
    return screenerJson(
      req,
      { error: err instanceof Error ? err.message : "invalid handoff" },
      400,
    )
  }

  const listing = toFlaskListing(flaskBody.listing)
  const headerKey = req.headers.get("idempotency-key")
  const idem =
    resolveIdempotencyKey(headerKey, listing.source, listing.sourceListingId)

  let upstream: Response
  try {
    upstream = await fetch(`${FLASK_URL.replace(/\/$/, "")}/v1/deals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": idem,
      },
      body: JSON.stringify(flaskBody),
    })
  } catch (err) {
    console.error("[POST /v1/deals] flask unreachable", err)
    return screenerJson(
      req,
      { error: "Flask /v1/deals unreachable" },
      502,
    )
  }

  const json = (await upstream.json().catch(() => ({}))) as Record<string, unknown>
  if (!upstream.ok) {
    return screenerJson(
      req,
      {
        error:
          (typeof json.error === "string" && json.error) ||
          (typeof json.message === "string" && json.message) ||
          `Flask handoff failed (${upstream.status})`,
        details: json,
      },
      upstream.status,
    )
  }

  try {
    const parsed = parseHandoffResponse(json)
    return screenerJson(req, parsed, upstream.status)
  } catch (err) {
    return screenerJson(
      req,
      { error: err instanceof Error ? err.message : "invalid Flask response", details: json },
      502,
    )
  }
}
