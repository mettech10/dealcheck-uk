import { NextResponse } from "next/server"

/**
 * Same-origin proxy for listing photos used by the share-card generator.
 *
 * Portal CDNs (Rightmove etc.) don't send CORS headers, so drawing their
 * images onto a canvas taints it and html2canvas/toBlob fails. Fetching
 * through this route makes the bytes same-origin. Strict host allowlist —
 * this must not become an open proxy.
 */

export const runtime = "nodejs"

const ALLOWED_HOSTS = new Set([
  "media.rightmove.co.uk",
  "lid.zoocdn.com",
  "st.zoocdn.com",
  "media.onthemarket.com",
])

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url")
  if (!target) {
    return NextResponse.json({ error: "url required" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 })
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: 502 },
      )
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg"
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "not an image" }, { status: 502 })
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType,
        // Listing photos are immutable per URL — cache aggressively.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 },
    )
  }
}
