/**
 * GET/POST /api/v1/licensing/check  (also rewritten from /v1/licensing/check)
 *
 * Thin Next proxy to Flask metusa-deal-analyzer POST /v1/licensing/check.
 * Maps the analyzer payload for UI (traffic lights, banners, deal_impact).
 * Does not compute licensing.
 *
 * Gated by licensing_checker_v1 (NEXT_PUBLIC_LICENSING_CHECKER_V1).
 */

import { NextResponse } from "next/server"
import { FlaskLicensingError } from "@/lib/licensing/flask"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import { parseLicensingIntendedUse } from "@/lib/licensing/request"
import { runLicensingCheck } from "@/lib/licensing/runCheck"
import type { LicensingCheckInput } from "@/lib/licensing/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 25

function parseCount(raw: unknown): number | null {
  if (raw == null || raw === "") return null
  const n = typeof raw === "number" ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function parseBool(raw: unknown): boolean | null {
  if (raw == null || raw === "") return null
  if (typeof raw === "boolean") return raw
  const s = String(raw).trim().toLowerCase()
  if (s === "true" || s === "1" || s === "yes") return true
  if (s === "false" || s === "0" || s === "no") return false
  return null
}

function pick(body: Record<string, unknown>, search: URLSearchParams | undefined, ...keys: string[]) {
  for (const key of keys) {
    if (body[key] != null && body[key] !== "") return body[key]
    const fromQuery = search?.get(key)
    if (fromQuery != null && fromQuery !== "") return fromQuery
  }
  return undefined
}

function parseInput(
  body: Record<string, unknown>,
  search?: URLSearchParams,
): LicensingCheckInput | { error: string } {
  const postcode = String(pick(body, search, "postcode") ?? "").trim()
  if (!postcode) return { error: "postcode is required" }
  return {
    postcode,
    occupants: parseCount(pick(body, search, "occupants")),
    rooms: parseCount(pick(body, search, "rooms")),
    households: parseCount(pick(body, search, "households")),
    sharingAmenities: parseBool(pick(body, search, "sharing_amenities", "sharingAmenities")),
    intendedUse: parseLicensingIntendedUse(
      pick(body, search, "intended_use", "intendedUse"),
    ),
    conversionFromC3: parseBool(pick(body, search, "conversion_from_c3", "conversionFromC3")),
    purposeBuiltFlat: parseBool(pick(body, search, "purpose_built_flat", "purposeBuiltFlat")),
    flatsInBlock: parseCount(pick(body, search, "flats_in_block", "flatsInBlock")),
    purposeBuiltFlatInBlockOf3Plus: parseBool(
      pick(body, search, "purpose_built_flat_in_block_of_3_plus", "purposeBuiltFlatInBlockOf3Plus"),
    ),
  }
}

function disabled() {
  return NextResponse.json(
    { error: "Feature disabled", flag: "licensing_checker_v1" },
    { status: 404 },
  )
}

function proxyStatus(err: FlaskLicensingError): number {
  if (err.code === "feature_disabled") return 503
  if (err.status === 404) return 400
  if (err.status >= 400 && err.status < 600) return err.status
  return 502
}

function fail(err: unknown) {
  if (err instanceof FlaskLicensingError) {
    const status = proxyStatus(err)
    console.error("[licensing/check] analyzer failed:", err.code, err.message)
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        disclaimer: err.disclaimer,
        legalClearance: false,
      },
      { status },
    )
  }
  const msg = err instanceof Error ? err.message : String(err)
  console.error("[licensing/check] failed:", msg)
  return NextResponse.json({ error: "Licensing check failed" }, { status: 500 })
}

async function run(parsed: LicensingCheckInput) {
  const result = await runLicensingCheck(parsed)
  return NextResponse.json(result)
}

export async function GET(req: Request) {
  if (!isLicensingCheckerEnabled()) return disabled()
  const url = new URL(req.url)
  const parsed = parseInput({}, url.searchParams)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  try {
    return await run(parsed)
  } catch (err) {
    return fail(err)
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
    return await run(parsed)
  } catch (err) {
    return fail(err)
  }
}
