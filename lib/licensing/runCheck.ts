/**
 * Server-side runner: forward to Flask `/v1/licensing/check` and map
 * the response for UI. Do not import from client components.
 */

import { FlaskLicensingError, postLicensingCheck } from "./flask"
import { mapFlaskLicensingResponse } from "./map"
import { buildFlaskLicensingPayload } from "./request"
import type { LicensingCheckInput, LicensingCheckResult } from "./types"

export async function runLicensingCheck(
  input: LicensingCheckInput,
): Promise<LicensingCheckResult> {
  const payload = buildFlaskLicensingPayload(input)
  const { status, json } = await postLicensingCheck(payload)
  try {
    return mapFlaskLicensingResponse(json, { httpStatus: status })
  } catch (err) {
    if (err instanceof FlaskLicensingError) throw err
    throw new FlaskLicensingError(
      err instanceof Error ? err.message : "Licensing check failed",
      { status, body: json },
    )
  }
}
