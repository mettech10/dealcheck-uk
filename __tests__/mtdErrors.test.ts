import { describe, expect, test } from "vitest"
import {
  STORAGE_UNAVAILABLE,
  STORAGE_UNAVAILABLE_MESSAGE,
  UPSTREAM_AUTH_FAILED,
  UPSTREAM_AUTH_FAILED_MESSAGE,
  messageForEnsureFailure,
  remapUpstreamMtdStatus,
  shellStateAfterSignedIn,
  userMessageForMtdError,
} from "@/lib/mtd/errors"

describe("remapUpstreamMtdStatus", () => {
  test("relabels Flask 401 as 503 upstream_auth_failed", () => {
    expect(remapUpstreamMtdStatus(401)).toEqual({
      clientStatus: 503,
      code: UPSTREAM_AUTH_FAILED,
      error: UPSTREAM_AUTH_FAILED_MESSAGE,
    })
  })

  test("passes through other statuses unchanged", () => {
    expect(remapUpstreamMtdStatus(200)).toEqual({ clientStatus: 200 })
    expect(remapUpstreamMtdStatus(404)).toEqual({ clientStatus: 404 })
    expect(remapUpstreamMtdStatus(502)).toEqual({ clientStatus: 502 })
  })
})

describe("signed-in ledger failures are never the auth gate", () => {
  test("401 and remapped 503 both stay on the error state", () => {
    expect(shellStateAfterSignedIn({ status: 401 })).toBe("error")
    expect(shellStateAfterSignedIn({ status: 503, code: UPSTREAM_AUTH_FAILED })).toBe("error")
    expect(shellStateAfterSignedIn({ status: 502 })).toBe("error")
  })

  test("message prefers the session-verify copy for Flask auth rejects", () => {
    expect(messageForEnsureFailure({ status: 401, message: "Unauthorised" })).toBe(
      UPSTREAM_AUTH_FAILED_MESSAGE,
    )
    expect(messageForEnsureFailure({ code: UPSTREAM_AUTH_FAILED })).toBe(
      UPSTREAM_AUTH_FAILED_MESSAGE,
    )
    expect(messageForEnsureFailure({ status: 502, message: "Flask down" })).toBe("Flask down")
  })
})

describe("storage_unavailable (Flask refused to write)", () => {
  test("users see a plain message, not Flask's operator text", () => {
    const flaskText = "MTD storage is not configured on this server... Set SUPABASE_URL"
    expect(userMessageForMtdError(503, STORAGE_UNAVAILABLE, flaskText)).toBe(
      STORAGE_UNAVAILABLE_MESSAGE,
    )
    expect(messageForEnsureFailure({ status: 503, code: STORAGE_UNAVAILABLE, message: flaskText })).toBe(
      STORAGE_UNAVAILABLE_MESSAGE,
    )
    expect(STORAGE_UNAVAILABLE_MESSAGE).not.toMatch(/SUPABASE|Flask/)
  })

  test("other errors keep the upstream message or a status fallback", () => {
    expect(userMessageForMtdError(409, undefined, "duplicate ledger entry")).toBe("duplicate ledger entry")
    expect(userMessageForMtdError(500, undefined, "  ")).toBe("Request failed (500)")
  })
})
