/**
 * BFF proxy for MTD Pack.
 *
 * Forwards `/api/mtd/<path>` to Flask `${analyzer}/v1/mtd/<path>` with the
 * caller's Supabase JWT. Flask remains the only store for mtd_* tables.
 * The browser never calls Flask directly (avoids CORS/CSP "Failed to fetch"
 * and a false unauthenticated gate on /mtd).
 *
 * Public accountant shares stay on GET `/v1/mtd/share/:token`.
 */

import { NextResponse } from "next/server"
import {
  analyzerEnvSource,
  analyzerMissingEnvMessage,
  analyzerUnreachableMessage,
  flaskMtdUrl,
} from "@/lib/mtd/config"
import { getMtdAuth, MTD_TOKEN_MISSING_MESSAGE } from "@/lib/mtd/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 25

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Metalyzi-MTD-Canonical": "flask",
  "X-Metalyzi-HMRC-Submission": "false",
} as const

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, canonical: "flask", hmrcSubmit: false, ...extra }, {
    status,
    headers: NO_STORE,
  })
}

function isSafeSegment(segment: string): boolean {
  if (!segment || segment === "." || segment === "..") return false
  if (segment.includes("/") || segment.includes("\\")) return false
  return true
}

async function proxy(request: Request, path: string[]): Promise<NextResponse> {
  if (!path.length || !path.every(isSafeSegment)) {
    return jsonError("Invalid MTD path", 400)
  }

  const auth = await getMtdAuth()
  if (auth.status === "anon") {
    return jsonError("Unauthorized", 401)
  }
  if (auth.status === "token_missing") {
    return jsonError(MTD_TOKEN_MISSING_MESSAGE, 503, { code: "mtd_session_token_missing" })
  }

  const source = analyzerEnvSource()
  // Default Render URL is intentional when Vercel env is unset. Only fail
  // closed if the resolved origin is empty (should not happen).
  if (!source.url) {
    return jsonError(analyzerMissingEnvMessage(), 503, { code: "mtd_analyzer_unconfigured" })
  }

  const incoming = new URL(request.url)
  const upstreamPath = `/${path.join("/")}${incoming.search}`
  const target = flaskMtdUrl(upstreamPath)

  const headers = new Headers()
  headers.set("Authorization", `Bearer ${auth.accessToken}`)
  headers.set("Accept", request.headers.get("Accept") || "*/*")
  headers.set("X-User-Id", auth.userId)
  if (auth.email) headers.set("X-User-Email", auth.email)

  const method = request.method.toUpperCase()
  const contentType = request.headers.get("content-type")
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
    const responseHeaders = new Headers(NO_STORE)
    const upstreamType = upstream.headers.get("content-type")
    if (upstreamType) responseHeaders.set("Content-Type", upstreamType)
    const disposition = upstream.headers.get("Content-Disposition")
    if (disposition) responseHeaders.set("Content-Disposition", disposition)
    return new NextResponse(buf, { status: upstream.status, headers: responseHeaders })
  } catch (err) {
    console.warn("[mtd] flask proxy failed:", err)
    return jsonError(analyzerUnreachableMessage(source.url), 502, {
      code: "mtd_analyzer_unreachable",
      analyzer: source.url,
      analyzerEnv: source.fromEnv ? source.key : "default",
    })
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
