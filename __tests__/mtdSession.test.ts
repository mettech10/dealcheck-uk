import { describe, expect, test } from "vitest"
import { accessTokenFromSbCookies } from "@/lib/mtd/session"

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig"

describe("accessTokenFromSbCookies", () => {
  test("reads JSON session cookies", () => {
    expect(
      accessTokenFromSbCookies([
        { name: "sb-abc-auth-token", value: JSON.stringify({ access_token: JWT }) },
      ]),
    ).toBe(JWT)
  })

  test("joins chunked cookies in numeric order", () => {
    const json = JSON.stringify({ access_token: JWT })
    const mid = Math.ceil(json.length / 2)
    expect(
      accessTokenFromSbCookies([
        { name: "sb-abc-auth-token.1", value: json.slice(mid) },
        { name: "sb-abc-auth-token.0", value: json.slice(0, mid) },
      ]),
    ).toBe(JWT)
  })

  test("decodes base64- prefixed cookies", () => {
    const payload = Buffer.from(JSON.stringify({ access_token: JWT })).toString("base64")
    expect(
      accessTokenFromSbCookies([{ name: "sb-abc-auth-token", value: `base64-${payload}` }]),
    ).toBe(JWT)
  })

  test("reads nested currentSession.access_token", () => {
    expect(
      accessTokenFromSbCookies([
        {
          name: "sb-abc-auth-token",
          value: JSON.stringify({ currentSession: { access_token: JWT } }),
        },
      ]),
    ).toBe(JWT)
  })

  test("ignores code-verifier cookies and empty stores", () => {
    expect(
      accessTokenFromSbCookies([
        { name: "sb-abc-auth-token-code-verifier", value: "pkce" },
        { name: "other", value: "x" },
      ]),
    ).toBeNull()
    expect(accessTokenFromSbCookies([])).toBeNull()
  })
})
