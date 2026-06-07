import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendWelcomeEmail } from "@/lib/brevo-email"
import { logAdminActivity, ipFromRequest } from "@/lib/admin-logs"
import type { EmailOtpType } from "@supabase/supabase-js"

/**
 * Build a Supabase server client whose cookie writes target the
 * supplied NextResponse. Required for OAuth callbacks because Next
 * Route Handlers don't propagate `cookies()` mutations onto a
 * returned `NextResponse.redirect(...)` — the session would be
 * created server-side but never reach the browser.
 *
 * Cookie defaults mirror lib/supabase/server.ts (httpOnly, secure
 * in prod, sameSite=lax, 7-day life) so the session cookie set here
 * round-trips correctly on subsequent requests.
 */
function createClientForResponse(request: NextRequest, response: NextResponse) {
  const isProd = process.env.NODE_ENV === "production"
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            // Keep Supabase's lifecycle bits (maxAge / expires /
            // domain) but FORCE our security defaults to win. With
            // the previous spread order, Supabase's defaults (which
            // include sameSite='lax' or sometimes undefined) could
            // override us — we want sameSite always 'lax', httpOnly
            // always true, secure always true in prod, and path
            // pinned to '/' so the cookie is sent on every route.
            const finalOptions: CookieOptions = {
              ...options,
              path: "/",
              httpOnly: true,
              secure: isProd,
              sameSite: "lax",
            }
            response.cookies.set(name, value, finalOptions)
          }
        },
      },
    },
  )
}

async function handleVerifiedUser(
  user: { id: string; email?: string | null; email_confirmed_at?: string | null; user_metadata?: Record<string, any> } | null,
  request?: NextRequest,
) {
  if (!user) return

  const isFirstVerification =
    user.email && user.email_confirmed_at && !user.user_metadata?.welcome_email_sent

  if (isFirstVerification) {
    console.log(`[Auth Callback] Sending welcome email to ${user.email}`)
    const sent = await sendWelcomeEmail(user.email!).catch((err) => {
      console.error(`[Auth Callback] Welcome email error:`, err)
      return false
    })
    if (sent) {
      const adminClient = createAdminClient()
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, welcome_email_sent: true },
      })
    } else {
      console.error(`[Auth Callback] Welcome email failed to send to ${user.email}`)
    }
    // Admin activity feed — first verified email signup. The `signup`
    // event is bound to first-verification, not row creation, so the
    // feed shows when a user actually became real (matches the
    // welcome-email gate).
    logAdminActivity({
      eventType: "signup",
      userId: user.id,
      userEmail: user.email,
      metadata: { source: "email_or_oauth_verified" },
      ipAddress: request ? ipFromRequest(request) : null,
    }).catch(() => {})
  } else {
    console.log(
      `[Auth Callback] Skipping welcome email for ${user?.email} (already sent or email not confirmed)`
    )
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const source = searchParams.get("source")
  const next = searchParams.get("next") ?? "/analyse"

  // Loud entry log so we can confirm in Vercel logs whether the
  // callback is even being reached. If you click Continue on
  // Google and this never prints, Supabase isn't redirecting here
  // — config issue (Site URL / Redirect URLs / provider Client
  // Secret) rather than a code bug.
  console.log(
    "[Auth Callback] entry",
    JSON.stringify({
      hasCode: !!code,
      hasTokenHash: !!token_hash,
      type,
      source,
      next,
      cookieNames: request.cookies.getAll().map((c) => c.name),
    }),
  )

  // Compute the final destination BEFORE we run auth so we can build
  // the response now and bind the Supabase client's cookie writes to
  // it. setAll() in createClientForResponse writes onto response.cookies
  // so the session cookie travels with the 302 back to the browser.
  let destination = `${origin}${next}`
  // For type-dependent flows we may swap the destination below; the
  // response object stays the same so cookies still propagate.
  let response = NextResponse.redirect(destination)

  const supabase = createClientForResponse(request, response)

  let sessionUser:
    | {
        id: string
        email?: string | null
        email_confirmed_at?: string | null
        user_metadata?: Record<string, any>
      }
    | null = null
  let authError: unknown = null

  if (code) {
    // OAuth / PKCE auth code flow
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    sessionUser = data?.user ?? null
    authError = error
  } else if (token_hash && type) {
    // Email OTP / magic-link verification flow (generateLink redirects here)
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    })
    sessionUser = data?.user ?? null
    authError = error
  }

  // Helper: swap the redirect Location while preserving the cookies
  // setAll() already wrote onto `response`.
  const redirectTo = (url: string): NextResponse => {
    const next = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) next.cookies.set(cookie)
    return next
  }

  if (sessionUser && !authError) {
    // Password reset flow — send user to the reset password page
    if (type === "recovery") {
      return redirectTo(`${origin}/reset-password`)
    }

    // Email verification (signup confirmation) — always show success page
    if (type === "signup" || type === "email" || source === "email_verify") {
      await handleVerifiedUser(sessionUser, request)
      return redirectTo(`${origin}/auth/verified`)
    }

    // Default OAuth success path — destination already baked in.
    return response
  }

  // Verification failed — redirect to dedicated failure page for email flows
  if (type === "signup" || type === "email" || token_hash || source === "email_verify") {
    console.error(`[Auth Callback] Verification failed:`, authError)
    return redirectTo(`${origin}/verification-failed`)
  }

  // OAuth / generic failure. Surface the real reason in a query
  // param (URL-safe truncation) so the next /api/debug/auth round
  // gives a definitive diagnosis instead of the generic "?error=auth".
  // No code AND no token_hash → the request never carried auth
  // material in the first place. That usually means Supabase
  // bounced the user back via its Site URL without our callback
  // being part of the OAuth chain — config / redirect-allowlist
  // issue. With a code present but no session, exchangeCodeForSession
  // returned an error which authError captures.
  const reason =
    !code && !token_hash
      ? "no_code_in_callback"
      : authError
        ? (authError as { message?: string }).message ?? "exchange_failed"
        : "session_missing"
  console.error(
    `[Auth Callback] failed → /login`,
    JSON.stringify({ reason, hasCode: !!code, hasUser: !!sessionUser }),
  )
  return redirectTo(
    `${origin}/login?error=auth&reason=${encodeURIComponent(
      String(reason).slice(0, 120),
    )}`,
  )
}
