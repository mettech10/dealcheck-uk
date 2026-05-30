/**
 * GET /api/me
 *
 * Minimal "who am I" probe used by client-side components that need
 * the signed-in user's id / email / display name without spinning up
 * a Supabase JS client in the browser. Returns 401 for anonymous.
 *
 * Currently consumed by:
 *   - components/CrispChat.tsx (to set Crisp identity)
 *
 * Intentionally returns only non-sensitive identity fields. Do NOT
 * extend this to leak tokens, role, payment data etc.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null

  return NextResponse.json({
    id: user.id,
    email: user.email ?? null,
    name,
  })
}
