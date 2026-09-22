"use client"

/**
 * Client island for /screener/connect.
 *
 * Auth is already confirmed by the server page (same cookie path as
 * /account). This island only mints tokens via GET /api/v1/screener/token
 * — never createBrowserClient().auth.getSession(), which cannot see
 * HttpOnly cookies and previously bounced signed-in users to /login.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  buildExtensionConnectHash,
  isSafeExtensionRedirect,
  screenerConnectLoginPath,
  type ScreenerConnectTokens,
} from "@/lib/deal-screener/connectRedirect"

type Status = "ready" | "redirecting" | "error"

export function ConnectClient({
  email,
  redirectUri,
}: {
  email: string | null
  redirectUri: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("ready")
  const [error, setError] = useState<string | null>(null)

  const safeRedirect = useMemo(() => {
    if (!redirectUri) return null
    return isSafeExtensionRedirect(redirectUri) ? redirectUri : null
  }, [redirectUri])

  const connect = async () => {
    setError(null)
    if (!safeRedirect) {
      setError(
        redirectUri
          ? "This page was opened with an invalid extension redirect URL."
          : "Open this page from the Deal Screener extension to finish connecting.",
      )
      return
    }

    setStatus("redirecting")
    try {
      const res = await fetch("/api/v1/screener/token", { credentials: "include" })
      if (res.status === 401) {
        router.replace(screenerConnectLoginPath(redirectUri))
        return
      }
      const body = (await res.json().catch(() => ({}))) as ScreenerConnectTokens & {
        error?: string
      }
      if (!res.ok || !body.access_token) {
        setError(body.error || "No session")
        setStatus("error")
        return
      }

      const hash = buildExtensionConnectHash(body)
      window.location.assign(`${safeRedirect}#${hash}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed")
      setStatus("error")
    }
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
            <Button type="button" onClick={() => void connect()} disabled={status === "redirecting"}>
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
        </div>
      </main>
    </div>
  )
}
