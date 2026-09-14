import {
  ensureBusiness,
  migrationRequiredResponse,
  requireMtdUser,
  tableMissing,
} from "@/lib/mtd/server"
import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"

function originFrom(req: Request): string {
  const url = new URL(req.url)
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host
  return `${proto}://${host}`
}

function shareUrl(req: Request, token: string): string {
  return `${originFrom(req)}/mtd/share/${token}`
}

export async function GET(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  try {
    const { data, error } = await auth.supabase
      .from("mtd_share_links")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })

    if (error) {
      if (tableMissing(error)) return migrationRequiredResponse()
      throw error
    }

    return NextResponse.json({
      links: (data ?? []).map((row) => ({
        id: row.id,
        token: row.token,
        label: row.label,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
        created_at: row.created_at,
        last_accessed_at: row.last_accessed_at,
        url: shareUrl(req, row.token as string),
      })),
    })
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] share GET", e)
    return NextResponse.json({ error: "Failed to list share links" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  let body: { label?: string; expiresInDays?: number } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const expiresInDays = Number(body.expiresInDays)
  const allowed = [7, 30, 90]
  const days = allowed.includes(expiresInDays) ? expiresInDays : 30
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  const token = randomBytes(24).toString("base64url")
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 200)
      : "Accountant pack"

  try {
    const business = await ensureBusiness(auth.supabase, auth.user.id)
    const { data, error } = await auth.supabase
      .from("mtd_share_links")
      .insert({
        user_id: auth.user.id,
        business_id: business.id,
        token,
        label,
        expires_at: expiresAt,
      })
      .select("*")
      .single()

    if (error) {
      if (tableMissing(error)) return migrationRequiredResponse()
      throw error
    }

    return NextResponse.json(
      {
        link: {
          id: data.id,
          token: data.token,
          label: data.label,
          expires_at: data.expires_at,
          revoked_at: data.revoked_at,
          created_at: data.created_at,
          last_accessed_at: data.last_accessed_at,
          url: shareUrl(req, data.token as string),
        },
      },
      { status: 201 },
    )
  } catch (e) {
    const err = e as { message?: string; code?: string }
    if (tableMissing(err)) return migrationRequiredResponse()
    console.error("[mtd] share POST", e)
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireMtdUser()
  if (auth.error) return auth.error

  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const { data, error } = await auth.supabase
    .from("mtd_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    if (tableMissing(error)) return migrationRequiredResponse()
    console.error("[mtd] share DELETE", error)
    return NextResponse.json({ error: "Failed to revoke share link" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
