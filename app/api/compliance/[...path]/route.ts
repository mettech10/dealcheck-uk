/**
 * BFF proxy for the Compliance Cockpit.
 *
 * Forwards `/api/compliance/<path>` to the Flask analyzer
 * `${ANALYZER_API_URL || NEXT_PUBLIC_ANALYZER_API_URL || BACKEND_API_URL}/v1/compliance/<path>`
 * with the caller's Supabase JWT.
 *
 * Flask is the only store for signed-in production/preview users.
 * This route never instructs the browser to use the localStorage stub
 * (`X-Compliance-Source: unavailable` with no stub write).
 */

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  accessTokenFromCookieList,
  bearerFromAuthorization,
  firstAccessToken,
} from "@/lib/compliance/accessToken"
import { complianceUpstreamUrl } from "@/lib/compliance/analyzerUrl"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function sourceHeaders(source: "live" | "unavailable"): HeadersInit {
  return {
    "X-Compliance-Source": source,
    "Cache-Control": "no-store",
  }
}

function unavailable(message: string, status = 502) {
  return NextResponse.json(
    { error: "compliance_upstream_unavailable", message },
    { status, headers: sourceHeaders("unavailable") },
  )
}

async function sessionContext(request: Request) {
  const incomingBearer = bearerFromAuthorization(
    request.headers.get("authorization"),
  )
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const cookieStore = await cookies()
  const accessToken = firstAccessToken(
    session?.access_token,
    incomingBearer,
    accessTokenFromCookieList(cookieStore.getAll()),
  )
  return { user, accessToken }
}

async function proxy(request: Request, path: string[]): Promise<NextResponse> {
  const auth = await sessionContext(request)
  const upstreamPath = path.join("/")
  const isPublic = upstreamPath === "catalogue" || upstreamPath === "health"

  if (!auth && !isPublic) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (auth && !auth.accessToken && !isPublic) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message:
          "Signed in, but no Supabase access token was available to call Flask /v1/compliance. Sign out and back in, then retry.",
      },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const target = complianceUpstreamUrl(upstreamPath, url.search)

  const headers = new Headers()
  if (auth?.accessToken) {
    headers.set("Authorization", `Bearer ${auth.accessToken}`)
  }
  if (auth?.user.id) headers.set("X-User-Id", auth.user.id)
  if (auth?.user.email) headers.set("X-User-Email", auth.user.email)
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

    const buf = await upstream.arrayBuffer()
    const responseHeaders = new Headers(sourceHeaders("live"))
    const upstreamType = upstream.headers.get("content-type")
    if (upstreamType) responseHeaders.set("Content-Type", upstreamType)
    return new NextResponse(buf, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    console.warn("[compliance] analyzer failed:", err)
    return unavailable("Flask /v1/compliance is unreachable")
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
