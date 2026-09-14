/**
 * GET/POST /api/v1/licensing/check  (also rewritten from /v1/licensing/check)
 *
 * England-first postcode licensing screen: mandatory HMO, additional HMO,
 * selective licensing, Article 4 C3→C4. Always legalClearance: false.
 *
 * Gated by licensing_checker_v1 (NEXT_PUBLIC_LICENSING_CHECKER_V1).
 */

import { NextResponse } from "next/server"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import { runLicensingCheck } from "@/lib/licensing/runCheck"
import type { LicensingCheckInput, LicensingIntendedUse } from "@/lib/licensing/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 20

const USES = new Set<LicensingIntendedUse>(["btl", "hmo", "sa", "flip", "other"])

function parseUse(raw: unknown): LicensingIntendedUse | null {
  if (typeof raw !== "string") return null
  const v = raw.trim().toLowerCase()
  if (USES.has(v as LicensingIntendedUse)) return v as LicensingIntendedUse
  if (v === "brr" || v === "brrrr") return "other"
  if (v === "r2sa") return "sa"
  return null
}

function parseCount(raw: unknown): number | null {
  if (raw == null || raw === "") return null
  const n = typeof raw === "number" ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function parseInput(
  body: Record<string, unknown>,
  search?: URLSearchParams,
): LicensingCheckInput | { error: string } {
  const postcode = String(body.postcode ?? search?.get("postcode") ?? "").trim()
  if (!postcode) return { error: "postcode is required" }
  return {
    postcode,
    occupants: parseCount(body.occupants ?? search?.get("occupants")),
    rooms: parseCount(body.rooms ?? search?.get("rooms")),
    intendedUse: parseUse(
      body.intendedUse ?? body.intended_use ?? search?.get("intendedUse"),
    ),
  }
}

function disabled() {
  return NextResponse.json(
    { error: "Feature disabled", flag: "licensing_checker_v1" },
    { status: 404 },
  )
}

export async function GET(req: Request) {
  if (!isLicensingCheckerEnabled()) return disabled()
  const url = new URL(req.url)
  const parsed = parseInput({}, url.searchParams)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  try {
    const result = await runLicensingCheck(parsed)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[licensing/check] GET failed:", msg)
    return NextResponse.json({ error: "Licensing check failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!isLicensingCheckerEnabled()) return disabled()
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const parsed = parseInput(body)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  try {
    const result = await runLicensingCheck(parsed)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[licensing/check] POST failed:", msg)
    return NextResponse.json({ error: "Licensing check failed" }, { status: 500 })
  }
}
