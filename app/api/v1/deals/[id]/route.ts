/**
 * GET /api/v1/deals/:id — hydrate /analyse?dealId= from shared Flask SoT.
 *
 * Reads `public.deals` (+ optional `properties`) under the caller's RLS.
 * Does not insert deals and does not run analysis.
 */

import { createUserClientFromRequest } from "@/lib/apiAuth"
import { hydrateFromDealRow, type PropertySpineRow } from "@/lib/deal-screener"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"

export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message || "").toLowerCase()
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST200" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find a relationship")
  )
}

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

type DealQueryRow = {
  id: string
  property_id?: string | null
  strategy?: string | null
  rent_pcm_gbp?: number | string | null
  listing?: Record<string, unknown> | null
  status?: string | null
  properties?: PropertySpineRow | PropertySpineRow[] | null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await createUserClientFromRequest(req)
  if (!user) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  const { id } = await params
  if (!id || !UUID_RE.test(id)) {
    return screenerJson(req, { error: "invalid dealId" }, 400)
  }

  const DEAL_COLUMNS = "id, property_id, strategy, rent_pcm_gbp, listing, status"
  const WITH_PROPERTY = `${DEAL_COLUMNS}, properties ( id, canonical_address, postcode, bedrooms, bathrooms, property_type, tenure )`

  const first = await supabase.from("deals").select(WITH_PROPERTY).eq("id", id).maybeSingle()
  let error = first.error
  let row = first.data as DealQueryRow | null

  if (error && isMissingRelation(error)) {
    const retry = await supabase
      .from("deals")
      .select(DEAL_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    error = retry.error
    row = retry.data as DealQueryRow | null
  }

  if (error && isMissingRelation(error)) {
    return screenerJson(
      req,
      {
        error: "deals_unavailable",
        message:
          "Shared deals table is not applied yet. Analyse can still use ?url=&strategy= from the Flask deep link.",
      },
      404,
    )
  }

  if (error || !row) {
    return screenerJson(req, { error: "not_found" }, 404)
  }

  const property = Array.isArray(row.properties)
    ? row.properties[0]
    : row.properties

  const hydrated = hydrateFromDealRow(row, property ?? null)
  return screenerJson(req, hydrated)
}
