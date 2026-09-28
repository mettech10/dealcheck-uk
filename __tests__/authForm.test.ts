import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/app/auth/actions", () => ({
  signInWithEmail: vi.fn(), signUpWithEmail: vi.fn(), signInWithGoogle: vi.fn(),
}))

import { AuthForm } from "@/components/auth/auth-form"

describe("authentication before JavaScript hydration", () => {
  test("signup exposes working legal destinations before accepting terms", () => {
    const html = renderToStaticMarkup(React.createElement(AuthForm, { initialMode: "signup" }))
    expect(html).toMatch(/<a[^>]*href="\/terms-of-service"[^>]*>Terms of Service<\/a>/)
    expect(html).toMatch(/<a[^>]*href="\/privacy-policy"[^>]*>Privacy Policy<\/a>/)
  })
  test.each(["login", "signup"] as const)("%s cannot submit credentials with native GET", (mode) => {
    const html = renderToStaticMarkup(React.createElement(AuthForm, { initialMode: mode }))
    const form = html.match(/<form\b[^>]*>/)?.[0]
    expect(form).toContain('method="post"')
    const submit = html.match(/<button\b(?=[^>]*type="submit")[^>]*>/)?.[0]
    expect(submit).toContain('disabled=""')
    // The credential controls remain named for the hydrated FormData handler.
    expect(html).toContain('name="email"')
    expect(html).toContain('name="password"')
  })
})
