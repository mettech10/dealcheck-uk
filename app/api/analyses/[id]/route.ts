import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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
