import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/analyses/[id] — fetch full saved analysis data for re-loading
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const full = await supabase
    .from("saved_analyses")
    .select("id, address, form_data, results, ai_text, backend_data, ltd_co_compare, ltd_co_compare_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!full.error && full.data) {
    return NextResponse.json(full.data)
  }

  // Column may not exist until the ltd_co_compare migration is applied.
  const legacy = await supabase
    .from("saved_analyses")
    .select("id, address, form_data, results, ai_text, backend_data")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (legacy.error || !legacy.data) {
    return NextResponse.json(
      { error: full.error?.message || legacy.error?.message || "Not found" },
      { status: 404 },
    )
  }

  return NextResponse.json({
    ...legacy.data,
    ltd_co_compare: null,
    ltd_co_compare_at: null,
  })
}

// DELETE /api/analyses/[id] — delete a saved analysis owned by the logged-in user
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const { error } = await supabase
    .from("saved_analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id) // RLS double-check — only delete own records

  if (error) {
    console.error("[DELETE /api/analyses]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
