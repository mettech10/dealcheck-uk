import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import { FlaskLicensingError } from "@/lib/licensing/flask"
import { parseLicensingIntendedUse } from "@/lib/licensing/request"
import { runLicensingCheck } from "@/lib/licensing/runCheck"
import type { LicensingCheckResult, LicensingIntendedUse } from "@/lib/licensing/types"
import { LicensingCheckerClient } from "./licensing-checker-client"

export const metadata: Metadata = {
  title: "Licensing Checker — Metalyzi",
  description:
    "England-first postcode screen for mandatory HMO, additional, selective licensing and Article 4 C3→C4. Screening aid — not legal clearance. Analyzer is source of truth.",
}

export const dynamic = "force-dynamic"

function asString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? ""
  return v ?? ""
}

function parseUse(raw: string): LicensingIntendedUse {
  return parseLicensingIntendedUse(raw) ?? "hmo"
}

function parseCount(raw: string): number | null {
  const n = Number(raw.trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function parseBool(raw: string): boolean | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (s === "true" || s === "1" || s === "yes") return true
  if (s === "false" || s === "0" || s === "no") return false
  return null
}

export default async function LicensingCheckerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isLicensingCheckerEnabled()) notFound()

  const sp = await searchParams
  const postcode = asString(sp.postcode).trim()
  const occupants = parseCount(asString(sp.occupants))
  const rooms = parseCount(asString(sp.rooms))
  const households = parseCount(asString(sp.households))
  const intendedUse = parseUse(asString(sp.intendedUse) || asString(sp.intended_use) || "hmo")
  const conversionFromC3 = parseBool(
    asString(sp.conversion_from_c3) || asString(sp.conversionFromC3),
  )
  const purposeBuiltFlat = parseBool(
    asString(sp.purpose_built_flat) || asString(sp.purposeBuiltFlat),
  )
  const flatsInBlock = parseCount(asString(sp.flats_in_block) || asString(sp.flatsInBlock))
  const sharingAmenities = parseBool(
    asString(sp.sharing_amenities) || asString(sp.sharingAmenities),
  )

  let result: LicensingCheckResult | null = null
  let error: string | null = null
  if (postcode) {
    try {
      result = await runLicensingCheck({
        postcode,
        occupants,
        rooms,
        households,
        sharingAmenities,
        intendedUse,
        conversionFromC3,
        purposeBuiltFlat,
        flatsInBlock,
      })
    } catch (err) {
      if (err instanceof FlaskLicensingError) {
        error = err.message
      } else {
        error = err instanceof Error ? err.message : "Licensing check failed"
      }
    }
  }

  return (
    <LicensingCheckerClient
      initialPostcode={postcode}
      initialOccupants={occupants ? String(occupants) : ""}
      initialRooms={rooms ? String(rooms) : ""}
      initialHouseholds={households ? String(households) : ""}
      initialIntendedUse={intendedUse}
      initialConversionFromC3={
        conversionFromC3 == null ? (intendedUse === "hmo" ? "true" : "") : String(conversionFromC3)
      }
      initialPurposeBuiltFlat={purposeBuiltFlat == null ? "" : String(purposeBuiltFlat)}
      initialFlatsInBlock={flatsInBlock ? String(flatsInBlock) : ""}
      result={result}
      error={error}
    />
  )
}
