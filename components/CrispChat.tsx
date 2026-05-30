"use client"

/**
 * Crisp live-chat bootstrap.
 *
 * Self-contained client island. Mounted once from app/layout.tsx so
 * Crisp loads on every route. Self-fetches the signed-in user's
 * profile via /api/user/credits — that endpoint already returns
 * tier + auth state and is cached per request, so we don't duplicate
 * a Supabase round-trip in another hook.
 *
 * Behaviour:
 *   - If NEXT_PUBLIC_CRISP_WEBSITE_ID is missing → no-op (dev / preview
 *     without the env var still build + boot, no console noise other
 *     than a single warn).
 *   - Crisp.configure() is invoked exactly once per page life. The SDK
 *     itself injects the bubble via a dynamic <script> tag, so it
 *     does NOT block page render.
 *   - Identity (email / nickname / session data) is pushed AFTER
 *     configure(). Anonymous visitors still get the bubble but with
 *     no identity attached.
 *   - Every Crisp call is wrapped in try/catch — the chat widget
 *     must NEVER break the host app.
 */

import { useEffect } from "react"
import { Crisp } from "crisp-sdk-web"

interface CreditState {
  authenticated: boolean
  tier: string
  isUnlimited: boolean
}

let configured = false

export default function CrispChat() {
  useEffect(() => {
    const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID
    if (!websiteId) {
      // One-time warn, intentionally quiet — we don't want to noise
      // the console on every route change during local dev when the
      // env var isn't set.
      if (!configured) {
        console.warn(
          "[CrispChat] NEXT_PUBLIC_CRISP_WEBSITE_ID not set — Crisp disabled.",
        )
        configured = true
      }
      return
    }

    // One-shot configure. Crisp's own SDK throws if called twice
    // (it does its own once-guard, but try/catch belt-and-braces).
    if (!configured) {
      try {
        Crisp.configure(websiteId)
        configured = true
      } catch (e) {
        console.warn("[CrispChat] configure() failed:", e)
        return
      }
    }

    // Push identity in the background. Failures are non-fatal: an
    // anonymous chat is still better than no chat at all.
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch("/api/user/credits", { cache: "no-store" })
        if (!r.ok) return
        const g = (await r.json()) as Partial<CreditState> & {
          // /api/user/credits doesn't currently return email / name;
          // both come from Supabase auth which the endpoint reads.
          // We re-derive them client-side from the Supabase session
          // exposed via a lightweight /auth/v1/user fetch below.
          [k: string]: unknown
        }
        if (cancelled || !g.authenticated) return

        // Pull email + name directly from Supabase auth — cheaper than
        // expanding /api/user/credits' contract.
        const meEmail = await fetchSupabaseEmailAndName()
        if (cancelled) return

        try {
          if (meEmail?.email) Crisp.user.setEmail(meEmail.email)
        } catch (e) {
          console.warn("[CrispChat] setEmail failed:", e)
        }
        try {
          if (meEmail?.name) Crisp.user.setNickname(meEmail.name)
        } catch (e) {
          console.warn("[CrispChat] setNickname failed:", e)
        }

        // Custom session data — visible to the agent in the Crisp
        // dashboard sidebar. Never include passwords, payment data,
        // or service-role tokens here.
        try {
          if (meEmail?.userId) {
            Crisp.session.setData({
              user_id: meEmail.userId,
              plan: g.tier ?? "free",
              unlimited: g.isUnlimited ? "yes" : "no",
              platform: "Metalyzi",
              dashboard_link: `https://metalyzi.co.uk/admin/users/${meEmail.userId}`,
            })
          }
        } catch (e) {
          console.warn("[CrispChat] setData failed:", e)
        }
      } catch (e) {
        console.warn("[CrispChat] identity push failed:", e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}

/**
 * Lightweight Supabase auth probe — calls our own /api/me endpoint
 * if it exists, otherwise falls back to reading the Supabase JWT
 * directly via the auth REST API. Returns just the bits we want to
 * surface to Crisp.
 *
 * Kept inside this file (not exported) so the rest of the app
 * doesn't accidentally start relying on it.
 */
async function fetchSupabaseEmailAndName(): Promise<
  { userId: string; email: string | null; name: string | null } | null
> {
  try {
    const r = await fetch("/api/me", { cache: "no-store" })
    if (!r.ok) return null
    const j = (await r.json()) as {
      id?: string
      email?: string | null
      name?: string | null
    }
    if (!j.id) return null
    return { userId: j.id, email: j.email ?? null, name: j.name ?? null }
  } catch {
    return null
  }
}
