import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isLicensingCheckerEnabled } from "@/lib/licensing/flag"
import { runLicensingCheck } from "@/lib/licensing/runCheck"
import type { LicensingCheckResult, LicensingIntendedUse } from "@/lib/licensing/types"
import { LicensingCheckerClient } from "./licensing-checker-client"

export const metadata: Metadata = {
  title: "Licensing Checker — Metalyzi",
  description:
    "England-first postcode screen for mandatory HMO, additional, selective licensing and Article 4 C3→C4. Screening aid — not legal clearance.",
}

export const dynamic = "force-dynamic"

const USES = new Set<LicensingIntendedUse>(["btl", "hmo", "sa", "flip", "other"])

function asString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? ""
  return v ?? ""
}

function parseUse(raw: string): LicensingIntendedUse {
  const v = raw.trim().toLowerCase()
  if (USES.has(v as LicensingIntendedUse)) return v as LicensingIntendedUse
  return "hmo"
}

function parseCount(raw: string): number | null {
  const n = Number(raw.trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
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
  const intendedUse = parseUse(asString(sp.intendedUse) || "hmo")

  let result: LicensingCheckResult | null = null
  let error: string | null = null
  if (postcode) {
    try {
      result = await runLicensingCheck({
        postcode,
        occupants,
        rooms,
        intendedUse,
      })
    } catch (err) {
      error = err instanceof Error ? err.message : "Licensing check failed"
    }
  }

  return (
    <LicensingCheckerClient
      initialPostcode={postcode}
      initialOccupants={occupants ? String(occupants) : ""}
      initialRooms={rooms ? String(rooms) : ""}
      initialIntendedUse={intendedUse}
      result={result}
      error={error}
    />
  )
}
