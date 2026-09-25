/**
 * /signup — marketing landing for Create account.
 *
 * /login only defaulted to the Log In tab, so www.metalyzi.co.uk/signup
 * 404'd. This route renders the same form in signup mode and keeps
 * returnTo / redirect / UTM / ref on the URL. Signed-in visitors go
 * to returnTo (or /account).
 */

import { Suspense } from "react"
import { redirect } from "next/navigation"
import { AuthForm, AuthFormLoading } from "@/components/auth/auth-form"
import { signedInSignupDestination } from "@/lib/auth/returnTo"
import { createReadOnlyClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const supabase = await createReadOnlyClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    redirect(signedInSignupDestination(first(raw.returnTo), first(raw.redirect)))
  }

  return (
    <Suspense fallback={<AuthFormLoading />}>
      <AuthForm initialMode="signup" />
    </Suspense>
  )
}
