"use client"

/**
 * /screener/connect — closed-beta Deal Screener account connect.
 *
 * The Chrome MV3 extension opens this page via chrome.identity.launchWebAuthFlow
 * (or a normal tab). A signed-in Metalyzi session is required; after Connect
 * we redirect to the extension's chromiumapp.org URL with the Supabase
 * access token in the fragment (never the query string).
 */

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

function isSafeExtensionRedirect(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol !== "https:") return false
    const labels = u.hostname.split(".")
    const id = labels[0] ?? ""
    return (
      labels.length === 3 &&
      labels[1] === "chromiumapp" &&
      labels[2] === "org" &&
      /^[a-p]{32}$/.test(id)
    )
  } catch {
    return false
  }
}

function ConnectInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirectUri = searchParams.get("redirect_uri") || ""
  const [email, setEmail] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "signed-out" | "ready" | "redirecting" | "error">("loading")
  const [error, setError] = useState<string | null>(null)

  const safeRedirect = useMemo(() => {
    if (!redirectUri) return null
    return isSafeExtensionRedirect(redirectUri) ? redirectUri : null
  }, [redirectUri])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message)
        setStatus("error")
        return
      }
      const session = data.session
      if (!session?.user) {
        setStatus("signed-out")
        const next = `/screener/connect${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`
        router.replace(`/login?returnTo=${encodeURIComponent(next)}`)
        return
      }
      setEmail(session.user.email ?? null)
      setStatus("ready")
    })
  }, [redirectUri, router])

  const connect = async () => {
    setError(null)
    const supabase = createClient()
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !data.session?.access_token) {
      setError(sessionError?.message || "No session")
      setStatus("error")
      return
    }
    if (!safeRedirect) {
      setError(
        redirectUri
          ? "This page was opened with an invalid extension redirect URL."
          : "Open this page from the Deal Screener extension to finish connecting.",
      )
      return
    }

    setStatus("redirecting")
    const session = data.session
    const hash = new URLSearchParams({
      access_token: session.access_token,
      token_type: "bearer",
      expires_in: String(session.expires_in ?? 3600),
      expires_at: String(session.expires_at ?? ""),
      refresh_token: session.refresh_token ?? "",
    })
    window.location.assign(`${safeRedirect}#${hash.toString()}`)
  }

  return (
    <div className="light-header-wash relative flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-navy.png"
              alt="Metalyzi"
              width={28}
              height={28}
              className="rounded-lg object-contain dark:hidden"
            />
            <Image
              src="/logo.png"
              alt="Metalyzi"
              width={28}
              height={28}
              className="hidden rounded-lg object-contain dark:block"
            />
            <span className="text-sm font-semibold text-foreground">Metalyzi</span>
          </Link>
          <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-300">
            Closed beta
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Deal Screener
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Connect your Metalyzi account</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The extension uses the same account you sign in with here. Listings are captured only when you click the
            extension — nothing is scraped in the background.
          </p>

          {status === "loading" || status === "signed-out" ? (
            <p className="mt-6 text-sm text-muted-foreground">Checking your session…</p>
          ) : (
            <>
              {email && (
                <p className="mt-6 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  Signed in as <span className="font-medium">{email}</span>
                </p>
              )}
              {error && (
                <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="mt-6 flex flex-col gap-3">
                <Button type="button" onClick={connect} disabled={status === "redirecting"}>
                  {status === "redirecting" ? "Connecting…" : "Connect Deal Screener"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/analyse">Back to Metalyzi</Link>
                </Button>
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                Unpacked Chrome extension only. Not listed on the Chrome Web Store. Photos stay off; captured listings
                are discarded when you close the popup unless you Open in Metalyzi.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default function ScreenerConnectPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <ConnectInner />
    </Suspense>
  )
}
