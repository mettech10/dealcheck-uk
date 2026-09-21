import { describe, expect, test } from "vitest"
import {
  accessTokenFromCookieList,
  bearerFromAuthorization,
  firstAccessToken,
  parseSupabaseAccessToken,
} from "@/lib/compliance/accessToken"
import {
  DEFAULT_COMPLIANCE_ANALYZER_URL,
  complianceUpstreamUrl,
  resolveComplianceAnalyzerUrl,
} from "@/lib/compliance/analyzerUrl"

describe("resolveComplianceAnalyzerUrl", () => {
  test("prefers ANALYZER_API_URL then documented public alias", () => {
    expect(
      resolveComplianceAnalyzerUrl({
        BACKEND_API_URL: "https://backend.example",
        NEXT_PUBLIC_ANALYZER_API_URL: "https://public.example/",
        ANALYZER_API_URL: "https://analyzer.example/",
      }),
    ).toBe("https://analyzer.example")
    expect(
      resolveComplianceAnalyzerUrl({
        BACKEND_API_URL: "https://backend.example",
        NEXT_PUBLIC_ANALYZER_API_URL: "https://public.example/",
      }),
    ).toBe("https://public.example")
  })

  test("falls back to the Render default so catalogue-only env still works", () => {
    expect(resolveComplianceAnalyzerUrl({})).toBe(DEFAULT_COMPLIANCE_ANALYZER_URL)
    expect(complianceUpstreamUrl("dashboard", "?propertyId=1", {})).toBe(
      `${DEFAULT_COMPLIANCE_ANALYZER_URL}/v1/compliance/dashboard?propertyId=1`,
    )
  })
})

describe("access token recovery", () => {
  test("reads Bearer and ignores empty", () => {
    expect(bearerFromAuthorization("Bearer abc")).toBe("abc")
    expect(bearerFromAuthorization("bearer  xyz  ")).toBe("xyz")
    expect(bearerFromAuthorization("Basic abc")).toBeNull()
    expect(firstAccessToken("", null, "tok")).toBe("tok")
  })

  test("parses chunked base64 supabase auth cookies", () => {
    const session = {
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa",
      refresh_token: "refresh",
    }
    const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`
    const mid = Math.ceil(encoded.length / 2)
    expect(
      accessTokenFromCookieList([
        { name: "sb-abcdxyz-auth-token.0", value: encoded.slice(0, mid) },
        { name: "sb-abcdxyz-auth-token.1", value: encoded.slice(mid) },
      ]),
    ).toBe(session.access_token)
  })

  test("parses JSON auth cookie without base64 prefix", () => {
    expect(
      parseSupabaseAccessToken(
        JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bbb" }),
      ),
    ).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bbb")
  })
})
