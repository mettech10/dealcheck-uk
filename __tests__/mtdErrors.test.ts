import { describe, expect, test } from "vitest"
import {
  UPSTREAM_AUTH_FAILED,
  UPSTREAM_AUTH_FAILED_MESSAGE,
  messageForEnsureFailure,
  remapUpstreamMtdStatus,
  shellStateAfterSignedIn,
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
