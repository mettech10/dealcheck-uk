/**
 * Feature flag: licensing_checker_v1
 *
 * Defaults ON so the analyse panel, standalone checker and the Next
 * proxy at /v1/licensing/check ship. Production checks are owned by
 * Flask metusa-deal-analyzer POST /v1/licensing/check — this flag only
 * gates the FE UI and proxy. Set
 *   NEXT_PUBLIC_LICENSING_CHECKER_V1=false
 * to hide the UI and 404 the Next route without a code change.
 */

export const LICENSING_CHECKER_FLAG = "licensing_checker_v1"

/** Browser endpoint: Next proxy. Flask is not called from the client. */
export const LICENSING_CHECK_ENDPOINT = "/api/v1/licensing/check"

const OFF = new Set(["0", "false", "off", "no"])

export function isLicensingCheckerEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_LICENSING_CHECKER_V1
  if (raw == null || raw.trim() === "") return true
  return !OFF.has(raw.trim().toLowerCase())
}
