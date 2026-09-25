import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import {
  AUTH_GATE_PATHS,
  SIGNUP_ALIASES,
  SIGNUP_PATH,
  authQueryString,
  loginPathFromQuery,
  safeReturnTo,
  signedInSignupDestination,
  signupPathFromQuery,
} from "@/lib/auth/returnTo"

describe("safeReturnTo", () => {
  test("allows relative paths and keeps their query string", () => {
    expect(safeReturnTo("/analyse")).toBe("/analyse")
    expect(safeReturnTo("/account?tab=credits")).toBe("/account?tab=credits")
    expect(safeReturnTo("/analyse?utm_source=email")).toBe("/analyse?utm_source=email")
  })

  test("rejects open redirects and auth-gate loops", () => {
    expect(safeReturnTo("https://evil.example/phish")).toBe("/analyse")
    expect(safeReturnTo("//evil.example")).toBe("/analyse")
    expect(safeReturnTo("/signup")).toBe("/analyse")
    expect(safeReturnTo("/signup?utm_source=x")).toBe("/analyse")
    expect(safeReturnTo("/login")).toBe("/analyse")
    expect(safeReturnTo("/register")).toBe("/analyse")
    expect(safeReturnTo("/sign-up")).toBe("/analyse")
    expect(safeReturnTo("")).toBe("/analyse")
    expect(safeReturnTo(null)).toBe("/analyse")
  })
})

describe("/signup query + signed-in landing", () => {
  test("preserves returnTo, redirect, ref and UTM params", () => {
    expect(
      signupPathFromQuery({
        returnTo: "/analyse",
        utm_source: "newsletter",
        utm_medium: "email",
        utm_campaign: "spring",
        ref: "ABCD1234",
        mode: "signup",
      }),
    ).toBe(
      "/signup?returnTo=%2Fanalyse&ref=ABCD1234&utm_source=newsletter&utm_medium=email&utm_campaign=spring",
    )
    expect(authQueryString(new URLSearchParams("redirect=/mtd&utm_term=btl"))).toBe(
      "?redirect=%2Fmtd&utm_term=btl",
    )
    expect(loginPathFromQuery({ returnTo: "/account" })).toBe("/login?returnTo=%2Faccount")
  })

  test("signed-in /signup uses returnTo, else /account — never the auth gate", () => {
    expect(signedInSignupDestination("/analyse", null)).toBe("/analyse")
    expect(signedInSignupDestination(null, "/tools/portfolio")).toBe("/tools/portfolio")
    expect(signedInSignupDestination(null, null)).toBe("/account")
    expect(signedInSignupDestination("/signup", null)).toBe("/account")
    expect(signedInSignupDestination("https://evil.example", "/account")).toBe("/account")
  })

  test("aliases are /register and /sign-up; next.config redirects them to /signup", () => {
    expect(SIGNUP_PATH).toBe("/signup")
    expect([...SIGNUP_ALIASES]).toEqual(["/register", "/sign-up"])
    expect(AUTH_GATE_PATHS.has("/signup")).toBe(true)

    const config = readFileSync("next.config.mjs", "utf8")
    expect(config).toMatch(/source:\s*'\/register'/)
    expect(config).toMatch(/source:\s*'\/sign-up'/)
    expect(config).toMatch(/destination:\s*'\/signup'/)
  })
})
