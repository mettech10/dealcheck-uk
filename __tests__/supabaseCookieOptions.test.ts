import { describe, expect, test } from "vitest"
import {
  isCookieDeletion,
  mergeAuthCookieOptions,
} from "@/lib/supabase/cookieOptions"
import { sessionFromSbCookies } from "@/lib/supabase/sessionCookies"

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig"

describe("mergeAuthCookieOptions", () => {
  test("preserves maxAge: 0 so chunk deletions actually delete", () => {
    const merged = mergeAuthCookieOptions({
      path: "/old",
      maxAge: 0,
      httpOnly: false,
      sameSite: "strict",
    })
    expect(merged.maxAge).toBe(0)
    expect(merged.path).toBe("/")
    expect(merged.httpOnly).toBe(true)
    expect(merged.sameSite).toBe("lax")
    expect(
      isCookieDeletion({ value: "", options: { maxAge: 0 } }),
    ).toBe(true)
  })

  test("does not invent a 7-day maxAge that would persist empty chunks", () => {
    const merged = mergeAuthCookieOptions({ maxAge: 0 })
    expect(merged.maxAge).not.toBe(60 * 60 * 24 * 7)
    expect(merged.maxAge).toBe(0)
  })

  test("keeps a real session maxAge from Supabase", () => {
    const merged = mergeAuthCookieOptions({ maxAge: 400 * 24 * 60 * 60 })
    expect(merged.maxAge).toBe(400 * 24 * 60 * 60)
    expect(merged.httpOnly).toBe(true)
  })
})

describe("sessionFromSbCookies", () => {
  test("reads access + refresh from a JSON session cookie", () => {
    expect(
      sessionFromSbCookies([
        {
          name: "sb-abc-auth-token",
          value: JSON.stringify({
            access_token: JWT,
            refresh_token: "ref_1",
            expires_at: 1_700_000_000,
            expires_in: 3600,
          }),
        },
      ]),
    ).toEqual({
      access_token: JWT,
      refresh_token: "ref_1",
      expires_at: 1_700_000_000,
      expires_in: 3600,
    })
  })

  test("joins chunked cookies and ignores leftover empty values that would poison JSON.parse", () => {
    const json = JSON.stringify({
      access_token: JWT,
      refresh_token: "ref_2",
    })
    const mid = Math.ceil(json.length / 2)
    expect(
      sessionFromSbCookies([
        { name: "sb-abc-auth-token.0", value: json.slice(0, mid) },
        { name: "sb-abc-auth-token.1", value: json.slice(mid) },
        { name: "sb-abc-auth-token.2", value: "" },
      ]),
    ).toEqual({
      access_token: JWT,
      refresh_token: "ref_2",
      expires_at: undefined,
      expires_in: undefined,
    })
  })
})
