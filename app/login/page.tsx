import { Suspense } from "react"
import { redirect } from "next/navigation"
import { AuthForm, AuthFormLoading } from "@/components/auth/auth-form"
import { signupPathFromQuery } from "@/lib/auth/returnTo"

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  if (first(raw.mode) === "signup") {
    redirect(signupPathFromQuery(raw))
  }

  return (
    <Suspense fallback={<AuthFormLoading />}>
      <AuthForm initialMode="login" />
    </Suspense>
  )
}
