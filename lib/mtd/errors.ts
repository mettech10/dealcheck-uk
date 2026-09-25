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
  if (typeof err.message === "string" && err.message.trim()) return err.message
  return UPSTREAM_AUTH_FAILED_MESSAGE
}
