/**
 * Feature flag: licensing_checker_v1
 *
 * Green-lit P0–P1. Defaults ON so the analyse panel, standalone checker
 * and /v1/licensing/check route ship. Set
 *   NEXT_PUBLIC_LICENSING_CHECKER_V1=false
 * to hide the UI and 404 the API without a code change.
 */

export const LICENSING_CHECKER_FLAG = "licensing_checker_v1"

const OFF = new Set(["0", "false", "off", "no"])

export function isLicensingCheckerEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1
  if (raw == null || raw.trim() === "") return true
  return !OFF.has(raw.trim().toLowerCase())
}
