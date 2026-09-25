/**
 * BFF proxy for the Compliance Cockpit.
 *
 * Forwards `/api/compliance/<path>` to Flask `/v1/compliance/<path>`
 * with a verified user access JWT (not a refresh token / anon key).
 * Flask is the only store. This route never enables the localStorage stub.
 *
 * Refresh an expired / near-expiry access token before forwarding, and
 * retry once on upstream 401. Only refreshSession writes cookies (#108).
 */

import { NextResponse } from "next/server"
import { complianceUpstreamUrl } from "@/lib/compliance/analyzerUrl"
import {
  COMPLIANCE_TOKEN_MISSING_MESSAGE,
  getComplianceAuth,
  type ComplianceAuth,
} from "@/lib/compliance/session"

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

function authHeaders(auth: Extract<ComplianceAuth, { status: "signed_in" }>): Headers {
  const headers = new Headers()
  headers.set("Authorization", `Bearer ${auth.accessToken}`)
  headers.set("X-User-Id", auth.userId)
  if (auth.email) headers.set("X-User-Email", auth.email)
  headers.set("Accept", "application/json")
  return headers
}

async function proxy(request: Request, path: string[]): Promise<NextResponse> {
  const upstreamPath = path.join("/")
  const isPublic = upstreamPath === "catalogue" || upstreamPath === "health"

  let auth = await getComplianceAuth(request)
  if (auth.status === "anon" && !isPublic) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (auth.status === "token_missing" && !isPublic) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message: COMPLIANCE_TOKEN_MISSING_MESSAGE,
      },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const target = complianceUpstreamUrl(upstreamPath, url.search)

  const contentType = request.headers.get("content-type")
  const method = request.method.toUpperCase()
  let body: ArrayBuffer | undefined
  if (method !== "GET" && method !== "HEAD") {
    body = await request.arrayBuffer()
  }

  const forward = async (signed: ComplianceAuth) => {
    const headers = signed.status === "signed_in" ? authHeaders(signed) : new Headers()
    headers.set("Accept", "application/json")
    if (body && contentType) headers.set("Content-Type", contentType)
    return fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
    })
  }

  try {
    let upstream = await forward(auth)
    if (upstream.status === 401 && !isPublic && auth.status === "signed_in") {
      const retried = await getComplianceAuth(request, { forceRefresh: true })
      if (retried.status === "signed_in") {
        auth = retried
        upstream = await forward(retried)
      }
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
