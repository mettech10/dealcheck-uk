/**
 * BFF proxy for the Compliance Cockpit.
 *
 * Frontend calls `/api/compliance/<path>`; this route forwards to
 * `${BACKEND_API_URL}/v1/compliance/<path>` with the caller's Supabase
 * JWT. When the backend surface is missing (network error, 404 on the
 * catalogue probe, or 501), we return 501 + `X-Compliance-Source:
 * unavailable` so `lib/compliance/client.ts` can fall back to the stub.
 *
 * Auth is always required — even the stub path is login-gated in the UI.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const UPSTREAM_UNAVAILABLE = 501

function sourceHeaders(source: "live" | "unavailable"): HeadersInit {
  return {
    "X-Compliance-Source": source,
    "Cache-Control": "no-store",
  }
}

function unavailable(message = "Compliance API is not available on the backend yet") {
  return NextResponse.json(
    { error: "compliance_upstream_unavailable", message, stub: true },
    { status: UPSTREAM_UNAVAILABLE, headers: sourceHeaders("unavailable") },
  )
}

async function sessionContext() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return { user, accessToken: session?.access_token ?? null }
}

async function proxy(request: Request, path: string[]): Promise<NextResponse> {
  const auth = await sessionContext()
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const backend = (process.env.BACKEND_API_URL ?? "").replace(/\/$/, "")
  if (!backend) return unavailable("BACKEND_API_URL is not configured")

  const url = new URL(request.url)
  const upstreamPath = path.join("/")
  const target = `${backend}/v1/compliance/${upstreamPath}${url.search}`

  const headers = new Headers()
  if (auth.accessToken) {
    headers.set("Authorization", `Bearer ${auth.accessToken}`)
  }
  headers.set("X-User-Id", auth.user.id)
  if (auth.user.email) headers.set("X-User-Email", auth.user.email)
  headers.set("Accept", "application/json")

  const contentType = request.headers.get("content-type")
  const method = request.method.toUpperCase()
  let body: ArrayBuffer | undefined
  if (method !== "GET" && method !== "HEAD") {
    body = await request.arrayBuffer()
    if (contentType) headers.set("Content-Type", contentType)
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
    })

    // Catalogue 404 = surface not merged yet → stub. Other 404s (missing
    // property file) are real and must pass through.
    const isCatalogue = upstreamPath === "catalogue" || upstreamPath === ""
    if (isCatalogue && (upstream.status === 404 || upstream.status === 501)) {
      return unavailable()
    }

    const buf = await upstream.arrayBuffer()
    const responseHeaders = new Headers(sourceHeaders("live"))
    const upstreamType = upstream.headers.get("content-type")
    if (upstreamType) responseHeaders.set("Content-Type", upstreamType)
    return new NextResponse(buf, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    console.warn("[compliance] upstream failed:", err)
    return unavailable()
  }
}

type Ctx = { params: Promise<{ path?: string[] }> }

export async function GET(request: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params
  return proxy(request, path)
}

export async function POST(request: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params
  return proxy(request, path)
}

export async function PUT(request: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params
  return proxy(request, path)
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params
  return proxy(request, path)
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params
  return proxy(request, path)
}
