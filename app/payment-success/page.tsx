/**
 * /payment-success?session_id=cs_…&returnTo=/analyse?…
 *
 * Dedicated post-Stripe landing. Handles three states:
 *   1. Anonymous user → stash session_id+returnTo in localStorage
 *      under 'pendingPayment', bounce to /login?returnTo=<this url>.
 *      The login page reads localStorage on success and round-trips
 *      back here.
 *   2. Authenticated user → call /api/payments/verify-session,
 *      show success screen for 3s with a progress bar, then
 *      router.replace(returnTo || '/analyse').
 *   3. Verify-session fails → show error with support link.
 *
 * The 3s delay is deliberate: the user needs visual confirmation
 * that the payment landed AND that credits/Pro are active. Going
 * straight back to the analyse page makes the receipt feel
 * invisible. Progress bar tells them exactly when it'll vanish.
 */

"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "pendingPayment"
const REDIRECT_DELAY_MS = 3000

type VerifyState =
  | { kind: "loading" }
  | {
      kind: "success"
      tier: string
      recorded: boolean
    }
  | { kind: "error"; message: string }

function PaymentSuccessInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id") || ""
  const rawReturn = searchParams.get("returnTo") || "/analyse"
  // Whitelist to relative paths — open-redirect guard mirroring the
  // server-side check in /api/payments/checkout.
  const returnTo =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//")
      ? rawReturn
      : "/analyse"

  const [state, setState] = useState<VerifyState>({ kind: "loading" })
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_MS)
  const verifyAttempted = useRef(false)

  // ── Verify session on mount ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setState({ kind: "error", message: "Missing session_id in URL" })
      return
    }
    if (verifyAttempted.current) return
    verifyAttempted.current = true

    ;(async () => {
      try {
        const r = await fetch(
          `/api/payments/verify-session?session_id=${encodeURIComponent(sessionId)}`,
        )
        // 401 = not authenticated. Stash + bounce to login. The login
        // page reads localStorage and brings the user back.
        if (r.status === 401) {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ sessionId, returnTo, ts: Date.now() }),
            )
          }
          const here = `/payment-success?session_id=${encodeURIComponent(sessionId)}&returnTo=${encodeURIComponent(returnTo)}`
          router.replace(`/login?returnTo=${encodeURIComponent(here)}`)
          return
        }
        const data = (await r.json().catch(() => ({}))) as {
          success?: boolean
          tier?: string
          recorded?: boolean
          error?: string
        }
        if (!r.ok || !data.success) {
          setState({
            kind: "error",
            message:
              data.error || `Couldn't verify payment (HTTP ${r.status})`,
          })
          return
        }
        // Clear any stashed pendingPayment now that we're confirmed.
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEY)
        }
        setState({
          kind: "success",
          tier: data.tier || "pay_per_analysis",
          recorded: !!data.recorded,
        })
      } catch (e) {
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Network error",
        })
      }
    })()
  }, [sessionId, returnTo, router])

  // ── Countdown + auto-redirect once success state lands ─────────────
  useEffect(() => {
    if (state.kind !== "success") return
    const start = Date.now()
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, REDIRECT_DELAY_MS - (Date.now() - start))
      setCountdown(remaining)
      if (remaining <= 0) {
        window.clearInterval(tick)
        router.replace(returnTo)
      }
    }, 50)
    return () => window.clearInterval(tick)
  }, [state.kind, returnTo, router])

  const isPro = state.kind === "success" && state.tier === "pro"

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-navy.png"
              alt="Metalyzi Logo"
              width={28}
              height={28}
              className="rounded-lg object-contain dark:hidden"
            />
            <Image
              src="/logo.png"
              alt="Metalyzi Logo"
              width={28}
              height={28}
              className="rounded-lg object-contain hidden dark:block"
            />
            <span className="text-sm font-semibold text-foreground">
              Metalyzi
            </span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          {state.kind === "loading" && (
            <>
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Confirming your payment…
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Hold tight — this usually takes a second or two.
              </p>
            </>
          )}

          {state.kind === "success" && (
            <>
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="size-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Payment confirmed!
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {isPro
                  ? "Your Metalyzi Pro is now active — unlimited analyses, all strategies, PDF export, saved deals."
                  : "1 analysis credit has been added to your account. Your credit never expires — use it whenever you're ready."}
              </p>
              {!state.recorded && (
                <p className="mt-2 text-xs text-muted-foreground/70">
                  Credit is processing — refresh in a moment if you don&apos;t
                  see it immediately on /account.
                </p>
              )}

              {/* Countdown bar — visual signal of when redirect fires. */}
              <div className="mt-8">
                <p className="text-xs text-muted-foreground">
                  Returning you to your analysis in{" "}
                  <span className="font-medium text-foreground">
                    {Math.ceil(countdown / 1000)}s
                  </span>
                  …
                </p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-50"
                    style={{
                      width: `${100 - (countdown / REDIRECT_DELAY_MS) * 100}%`,
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => router.replace(returnTo)}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  Skip wait →
                </button>
              </div>
            </>
          )}

          {state.kind === "error" && (
            <>
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-amber-500/10">
                <AlertTriangle className="size-8 text-amber-500" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Couldn&apos;t confirm your payment
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {state.message}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                If you were charged, email{" "}
                <a
                  href="mailto:contact@metalyzi.co.uk"
                  className="text-primary hover:underline"
                >
                  contact@metalyzi.co.uk
                </a>{" "}
                with this session id:{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {sessionId || "(none)"}
                </code>
              </p>
              <div className="mt-6 flex justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/analyse">Back to analyse</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/account">View account</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <PaymentSuccessInner />
    </Suspense>
  )
}
