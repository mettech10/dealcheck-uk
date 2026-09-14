import { NextResponse } from "next/server"

const WEB_ORIGINS = new Set([
  "https://metalyzi.co.uk",
  "https://www.metalyzi.co.uk",
  "http://localhost:3000",
])

export function isAllowedScreenerOrigin(origin: string | null): boolean {
  if (!origin) return true
  if (WEB_ORIGINS.has(origin)) return true
  return origin.startsWith("chrome-extension://")
}

export function screenerCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
  if (origin && isAllowedScreenerOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  }
  return headers
}

export function screenerJson(
  req: Request,
  body: unknown,
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: screenerCorsHeaders(req),
  })
}

export function screenerOptions(req: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: screenerCorsHeaders(req),
  })
}
