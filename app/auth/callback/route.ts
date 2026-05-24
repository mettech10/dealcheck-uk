import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendWelcomeEmail } from "@/lib/brevo-email"
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
  const baseOptions: CookieOptions = {
    path: "/",
    secure: isProd,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  }
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
            response.cookies.set(name, value, { ...baseOptions, ...options })
          }
        },
      },
    },
  )
}

async function handleVerifiedUser(
  user: { id: string; email?: string | null; email_confirmed_at?: string | null; user_metadata?: Record<string, any> } | null,
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
      await handleVerifiedUser(sessionUser)
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

  // Auth error — redirect to login with error param
  return redirectTo(`${origin}/login?error=auth`)
}
