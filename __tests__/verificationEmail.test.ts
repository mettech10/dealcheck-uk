import { beforeEach, describe, expect, test, vi } from "vitest"
const mocks = vi.hoisted(() => ({ generateLink: vi.fn(), deleteUser: vi.fn(), send: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: mocks } }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/brevo-email", () => ({ sendVerificationEmail: mocks.send, sendPasswordResetEmail: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "metalyzi.test" }) }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
import { signUpWithEmail } from "@/app/auth/actions"
import { verificationUrl } from "@/lib/auth/verification-url"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://metalyzi.test")
  mocks.send.mockResolvedValue(true)
  mocks.generateLink.mockResolvedValue({ error: null, data: {
    properties: { hashed_token: "test-token+hash", action_link: "https://supabase.test/verify?token=wrong-flow" },
    user: { id: "existing-user", created_at: "2020-01-01T00:00:00Z" },
  } })
})

describe("email verification callback contract", () => {
  test("signup and resend email the same server-verifiable token format", async () => {
    const form = new FormData()
    form.set("email", "qa@example.test"); form.set("password", "test-only-password"); form.set("name", "QA")
    await signUpWithEmail(form)
    const { POST } = await import("@/app/api/auth/resend-verification/route")
    const response = await POST(new Request("https://metalyzi.test/api/auth/resend-verification", {
      method: "POST", body: JSON.stringify({ email: "qa@example.test" }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.send).toHaveBeenCalledTimes(2)
    for (const [, link] of mocks.send.mock.calls) {
      const url = new URL(link)
      expect(url.origin + url.pathname).toBe("https://metalyzi.test/auth/callback")
      expect(url.searchParams.get("token_hash")).toBe("test-token+hash")
      expect(url.searchParams.get("type")).toBe("signup")
      expect(url.hash).toBe("")
    }
  })
  test("does not email a failed token request or reveal account status", async () => {
    mocks.generateLink.mockResolvedValue({ data: null, error: { message: "already confirmed" } })
    const { POST } = await import("@/app/api/auth/resend-verification/route")
    const response = await POST(new Request("https://metalyzi.test/api/auth/resend-verification", {
      method: "POST", body: JSON.stringify({ email: "confirmed@example.test" }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(await response.json()).toHaveProperty("message")
  })
  test("rejects missing token hashes rather than sending a broken link", () => {
    expect(() => verificationUrl("https://metalyzi.test", "")).toThrow("Missing verification token")
  })
})
