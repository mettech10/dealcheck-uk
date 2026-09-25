import { describe, expect, test } from "vitest"
import {
  accessTokenFromCookieList,
  bearerFromAuthorization,
  firstUserAccessToken,
  isUserAccessToken,
  parseSupabaseAccessToken,
} from "@/lib/compliance/accessToken"
import {
  DEFAULT_COMPLIANCE_ANALYZER_URL,
  complianceUpstreamUrl,
  resolveComplianceAnalyzerUrl,
} from "@/lib/compliance/analyzerUrl"

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  )
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.sig`
}

const ACCESS = jwt({
  role: "authenticated",
  sub: "11111111-1111-4111-8111-111111111111",
  exp: Math.floor(Date.now() / 1000) + 3600,
})

const EXPIRED = jwt({
  role: "authenticated",
  sub: "11111111-1111-4111-8111-111111111111",
  exp: Math.floor(Date.now() / 1000) - 60,
})

const ANON = jwt({
  role: "anon",
  sub: "anon",
  exp: Math.floor(Date.now() / 1000) + 3600,
})

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
    expect(firstUserAccessToken("", null, ACCESS)).toBe(ACCESS)
    expect(firstUserAccessToken(EXPIRED, ANON, ACCESS)).toBe(ACCESS)
  })

  test("rejects expired, anon, and refresh-shaped tokens", () => {
    expect(isUserAccessToken(ACCESS)).toBe(true)
    expect(isUserAccessToken(EXPIRED)).toBe(false)
    expect(isUserAccessToken(ANON)).toBe(false)
    expect(isUserAccessToken("v1.refresh-not-a-jwt")).toBe(false)
    expect(isUserAccessToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.sig")).toBe(
      false,
    )
  })

  test("parses chunked base64 supabase auth cookies", () => {
    const session = {
      access_token: ACCESS,
      refresh_token: "v1.refresh",
    }
    const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`
    const mid = Math.ceil(encoded.length / 2)
    expect(
      accessTokenFromCookieList([
        { name: "sb-abcdxyz-auth-token.0", value: encoded.slice(0, mid) },
        { name: "sb-abcdxyz-auth-token.1", value: encoded.slice(mid) },
      ]),
    ).toBe(ACCESS)
  })

  test("does not treat refresh_token as the access token", () => {
    expect(
      parseSupabaseAccessToken(
        JSON.stringify({ access_token: "v1.refresh", refresh_token: ACCESS }),
      ),
    ).toBeNull()
  })

  test("parses JSON auth cookie without base64 prefix", () => {
    expect(
      parseSupabaseAccessToken(JSON.stringify({ access_token: ACCESS })),
    ).toBe(ACCESS)
  })
})
