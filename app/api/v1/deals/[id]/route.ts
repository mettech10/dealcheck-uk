/**
 * GET /api/v1/deals/:id
 *
 * Load a screener-handoff listing for the signed-in owner so /analyse
 * can prefill the form. Cookie session (web) or Bearer (extension).
 */

import { createUserClientFromRequest, getRequestUser } from "@/lib/apiAuth"
import { listingToFormPrefill, normaliseStrategyHint } from "@/lib/deal-screener"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"
import type { NormalisedListingV1 } from "@/lib/deal-screener/types"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req)
  if (!user) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  const { id } = await params
  if (!id) {
    return screenerJson(req, { error: "Missing id" }, 400)
  }

  const supabase = await createUserClientFromRequest(req)
  const { data, error } = await supabase
    .from("screener_deals")
    .select("id, strategy_hint, listing, schema_version, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    console.error("[GET /v1/deals/:id]", error)
    return screenerJson(req, { error: error.message }, 500)
  }
  if (!data) {
    return screenerJson(req, { error: "Not found" }, 404)
  }

  const hint = normaliseStrategyHint(data.strategy_hint) ?? "btl"
  const listing = data.listing as NormalisedListingV1
  const formPrefill = listingToFormPrefill(listing, hint)

  return screenerJson(req, {
    dealId: data.id,
    schemaVersion: data.schema_version,
    strategyHint: hint,
    listing,
    formPrefill,
    createdAt: data.created_at,
  })
}
