/**
 * MTD BFF / UI error codes.
 *
 * A Flask 401 (`Unauthorised`) after Next already authenticated the user
 * is an upstream auth/config failure — not a signed-out session. The
 * proxy remaps that to 503 + `upstream_auth_failed` so the workspace
 * shell can show Retry instead of the Sign in gate.
 */

export const UPSTREAM_AUTH_FAILED = "upstream_auth_failed"

export const UPSTREAM_AUTH_FAILED_MESSAGE =
  "MTD service couldn't verify your session. Try again shortly."

/**
 * Flask refuses MTD writes (503 `storage_unavailable`) when its database
 * is unreachable or unconfigured, rather than accepting records it would
 * lose. The raw Flask text is operator-facing, so users get this instead.
 */
export const STORAGE_UNAVAILABLE = "storage_unavailable"

export const STORAGE_UNAVAILABLE_MESSAGE =
  "Your MTD records can't be saved right now, so nothing was changed. Please try again shortly."

/** User-facing message for a failed MTD request. */
export function userMessageForMtdError(
  status: number,
  code: string | undefined,
  raw: string | undefined,
): string {
  if (code === STORAGE_UNAVAILABLE) return STORAGE_UNAVAILABLE_MESSAGE
  if (typeof raw === "string" && raw.trim()) return raw
  return `Request failed (${status})`
}

export type MtdErrorFields = {
  status?: number
  code?: string
  message?: string
}

/** Remap an upstream Flask status before it reaches the browser. */
export function remapUpstreamMtdStatus(status: number): {
  clientStatus: number
  code?: string
  error?: string
} {
  if (status === 401) {
    return {
      clientStatus: 503,
      code: UPSTREAM_AUTH_FAILED,
      error: UPSTREAM_AUTH_FAILED_MESSAGE,
    }
  }
  return { clientStatus: status }
}

/**
 * After `/api/me` confirmed the user is signed in, never treat a ledger
 * failure as anonymous. 401 from Flask (or a remapped 503) is an error.
 */
export function shellStateAfterSignedIn(err: MtdErrorFields): "error" {
  void err
  return "error"
}

export function messageForEnsureFailure(err: MtdErrorFields): string {
  if (err.code === UPSTREAM_AUTH_FAILED || err.status === 401) {
    return UPSTREAM_AUTH_FAILED_MESSAGE
  }
  if (err.code === STORAGE_UNAVAILABLE) return STORAGE_UNAVAILABLE_MESSAGE
  if (typeof err.message === "string" && err.message.trim()) return err.message
  return UPSTREAM_AUTH_FAILED_MESSAGE
}
