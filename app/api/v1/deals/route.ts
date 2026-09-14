/**
 * POST /api/v1/deals  (also rewritten from POST /v1/deals)
 *
 * Deal Screener handoff. Creates (or returns) a schemaVersion 1 listing
 * draft for the signed-in Metalyzi account. Photos are stripped. The
 * Idempotency-Key is `screener:{source}:{sourceListingId}`.
 *
 * Auth: cookie session or Authorization: Bearer <supabase access token>
 * from /screener/connect.
 */

import { createUserClientFromRequest, getRequestUser } from "@/lib/apiAuth"
import {
  SCHEMA_VERSION,
  buildHandoffRequest,
  idempotencyKey,
  normaliseStrategyHint,
  stripPhotos,
  type NormalisedListingV1,
} from "@/lib/deal-screener"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"
import type { HandoffResponseV1 } from "@/lib/deal-screener/types"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function POST(req: Request) {
  const user = await getRequestUser(req)
  if (!user) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return screenerJson(req, { error: "Invalid JSON" }, 400)
  }

  const payload = body as Record<string, unknown>
  if (payload.source !== "screener") {
    return screenerJson(
      req,
      { error: "source must be 'screener'" },
      400,
    )
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    return screenerJson(
      req,
      { error: `schemaVersion must be ${SCHEMA_VERSION}` },
      400,
    )
  }

  const hint = normaliseStrategyHint(payload.strategyHint)
  if (!hint) {
    return screenerJson(
      req,
      { error: "strategyHint must be a lowercase hint (e.g. btl, brrr, hmo)" },
      400,
    )
  }

  const listingRaw = payload.listing
  if (!listingRaw || typeof listingRaw !== "object") {
    return screenerJson(req, { error: "listing is required" }, 400)
  }

  const listing = stripPhotos(
    listingRaw as Record<string, unknown>,
  ) as unknown as NormalisedListingV1

  if (listing.source !== "rightmove") {
    return screenerJson(req, { error: "listing.source must be 'rightmove'" }, 400)
  }
  if (!listing.sourceListingId || typeof listing.sourceListingId !== "string") {
    return screenerJson(req, { error: "listing.sourceListingId is required" }, 400)
  }
  if (!listing.listingUrl || typeof listing.listingUrl !== "string") {
    return screenerJson(req, { error: "listing.listingUrl is required" }, 400)
  }
  if (!listing.address || typeof listing.address !== "string") {
    return screenerJson(req, { error: "listing.address is required" }, 400)
  }

  listing.monthlyRent =
    typeof listing.monthlyRent === "number" && listing.monthlyRent > 0
      ? listing.monthlyRent
      : null

  let request
  try {
    request = buildHandoffRequest(listing, hint)
  } catch (err) {
    return screenerJson(
      req,
      { error: err instanceof Error ? err.message : "invalid handoff" },
      400,
    )
  }

  const expectedKey = idempotencyKey(
    request.listing.source,
    request.listing.sourceListingId,
  )
  const headerKey = req.headers.get("idempotency-key")?.trim() || ""
  if (!headerKey) {
    return screenerJson(
      req,
      { error: "Idempotency-Key header is required" },
      400,
    )
  }
  if (headerKey !== expectedKey) {
    return screenerJson(
      req,
      {
        error: `Idempotency-Key must be ${expectedKey}`,
      },
      400,
    )
  }

  let supabase
  try {
    supabase = await createUserClientFromRequest(req)
  } catch (err) {
    return screenerJson(
      req,
      { error: err instanceof Error ? err.message : "auth client failed" },
      500,
    )
  }

  const { data: existing, error: lookupError } = await supabase
    .from("screener_deals")
    .select("id")
    .eq("user_id", user.id)
    .eq("idempotency_key", expectedKey)
    .maybeSingle()

  if (lookupError && lookupError.code !== "PGRST116") {
    console.error("[POST /v1/deals] lookup", lookupError)
    return screenerJson(req, { error: lookupError.message }, 500)
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("screener_deals")
      .update({
        strategy_hint: request.strategyHint,
        listing: request.listing,
        schema_version: SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("[POST /v1/deals] update", updateError)
      return screenerJson(req, { error: updateError.message }, 500)
    }

    return screenerJson(req, responseFor(existing.id))
  }

  const { data: inserted, error: insertError } = await supabase
    .from("screener_deals")
    .insert({
      user_id: user.id,
      idempotency_key: expectedKey,
      source: "screener",
      schema_version: SCHEMA_VERSION,
      strategy_hint: request.strategyHint,
      listing: request.listing,
    })
    .select("id")
    .single()

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      const { data: raced } = await supabase
        .from("screener_deals")
        .select("id")
        .eq("user_id", user.id)
        .eq("idempotency_key", expectedKey)
        .maybeSingle()
      if (raced?.id) return screenerJson(req, responseFor(raced.id))
    }
    console.error("[POST /v1/deals] insert", insertError)
    return screenerJson(
      req,
      { error: insertError?.message || "Failed to save deal" },
      500,
    )
  }

  return screenerJson(req, responseFor(inserted.id), 201)
}

function responseFor(dealId: string): HandoffResponseV1 {
  return {
    dealId,
    deepLinkPath: `/analyse?dealId=${encodeURIComponent(dealId)}&source=screener`,
  }
}
