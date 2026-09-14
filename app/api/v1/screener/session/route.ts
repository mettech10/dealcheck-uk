/**
 * GET /api/v1/screener/session
 *
 * Identity probe for the Deal Screener connect page / extension.
 * Cookie session or Bearer token. Closed beta — any signed-in Metalyzi
 * account; distribution is unpacked-only, not the Chrome Web Store.
 */

import { getRequestUser } from "@/lib/apiAuth"
import { screenerJson, screenerOptions } from "@/lib/deal-screener/cors"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: Request) {
  return screenerOptions(req)
}

export async function GET(req: Request) {
  const user = await getRequestUser(req)
  if (!user) {
    return screenerJson(req, { error: "unauthenticated" }, 401)
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null

  return screenerJson(req, {
    id: user.id,
    email: user.email ?? null,
    name,
    closedBeta: true,
  })
}
