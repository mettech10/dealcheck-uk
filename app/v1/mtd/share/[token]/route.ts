import { flaskMtdUrl } from "@/lib/mtd/config"
import { NextResponse } from "next/server"

/**
 * Public accountant share proxy → Flask GET /v1/mtd/share/:token
 * No Next mtd_* tables. Authenticated pack CRUD happens on Flask.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 })
  }
  const incoming = new URL(req.url)
  const format = (incoming.searchParams.get("format") || "").toLowerCase()
  const qs = format ? `?format=${encodeURIComponent(format)}` : ""
  const upstream = flaskMtdUrl(`/share/${encodeURIComponent(token)}${qs}`)

  try {
    const res = await fetch(upstream, { cache: "no-store" })
    const contentType = res.headers.get("content-type") || "application/json"
    const body = await res.arrayBuffer()
    const headers = new Headers()
    headers.set("Content-Type", contentType)
    const disposition = res.headers.get("Content-Disposition")
    if (disposition) headers.set("Content-Disposition", disposition)
    headers.set("X-Metalyzi-HMRC-Submission", "false")
    headers.set("X-Metalyzi-MTD-Canonical", "flask")
    return new NextResponse(body, { status: res.status, headers })
  } catch (e) {
    console.error("[mtd] flask share proxy", e)
    return NextResponse.json(
      { error: "Failed to load shared pack from the MTD API." },
      { status: 502 },
    )
  }
}
