/**
 * POST /api/v1/deals is retired as a deals source of truth.
 *
 * Canonical create is Flask `POST {BACKEND_API_URL}/v1/deals`
 * (metusa-deal-analyzer PR #92). The Deal Screener extension POSTs
 * Flask directly with the Bearer token from /screener/connect.
 *
 * Next hydrates `/analyse?dealId=` via GET /api/v1/deals/:id against
 * shared `deals` (+ `properties`) under user RLS — not screener_deals.
 */

import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function POST(req: Request) {
  return screenerJson(
    req,
    {
      error: "handoff_retired",
      message:
        "Next POST /v1/deals is retired. POST Flask BACKEND_API_URL/v1/deals with a Bearer Supabase access token from /screener/connect.",
    },
    410,
  )
}
