"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Building2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { Toaster } from "@/components/ui/sonner"
import { MtdDisclaimerBanner } from "./disclaimer-banner"
import { MtdSubnav } from "./subnav"
import { analyzerApiUrl, analyzerUnreachableMessage } from "@/lib/mtd/config"
import { ensureBusiness } from "@/lib/mtd/client"
import { MtdBusinessProvider } from "@/lib/mtd/workspace-context"
import type { FlaskBusiness } from "@/lib/mtd/types"

async function probeSignedIn(): Promise<"anon" | "signed_in" | "error"> {
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
    if (res.status === 401) return "anon"
    if (!res.ok) return "error"
    return "signed_in"
  } catch {
    return "error"
  }
}

export function MtdWorkspaceShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  const [state, setState] = useState<"loading" | "anon" | "error" | "ready">("loading")
  const [error, setError] = useState<string | null>(null)
  const [business, setBusiness] = useState<FlaskBusiness | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const auth = await probeSignedIn()
      if (cancelled) return
      if (auth === "anon") {
        setState("anon")
        return
      }
      if (auth === "error") {
        setError("Could not check your Metalyzi session. Refresh and try again.")
        setState("error")
        return
      }
      try {
        const biz = await ensureBusiness()
        if (cancelled) return
        setBusiness(biz)
        setState("ready")
      } catch (e) {
        if (cancelled) return
        const status = (e as Error & { status?: number }).status
        if (status === 401) {
          setState("anon")
          return
        }
        const msg =
          e instanceof Error ? e.message : analyzerUnreachableMessage(analyzerApiUrl())
        toast.error(msg)
        setError(msg)
        setState("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <ToolsTopBar />
      <Toaster />

      {state === "loading" && (
        <div className="p-12 text-center text-muted-foreground">Loading MTD Pack…</div>
      )}

      {state === "anon" && (
        <div className="flex flex-col gap-6 pt-6 text-center">
          <Building2 className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">MTD Pack</h1>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Sign in to keep a digital ledger for your UK property business, review a quarterly
            pack aligned to SA105 categories, and share working papers with your accountant.
            Metalyzi does not submit to HMRC.
          </p>
          <MtdDisclaimerBanner compact />
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link href="/login?returnTo=/mtd">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col gap-4 pt-6">
          <h1 className="text-2xl font-bold">MTD Pack</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground">
            Ledger writes go to Flask via same-origin{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">/api/mtd/*</code> (BFF) →{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">/v1/mtd/*</code>. Set{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">ANALYZER_API_URL</code> or{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">BACKEND_API_URL</code> on Vercel if
            the host is not {analyzerApiUrl()}.{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">NEXT_PUBLIC_ANALYZER_API_URL</code> is
            optional for this BFF path.
          </p>
        </div>
      )}

      {state === "ready" && business && (
        <MtdBusinessProvider business={business}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Not HMRC software
              </span>
            </div>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <MtdDisclaimerBanner compact />
          <MtdSubnav />
          {children}
        </MtdBusinessProvider>
      )}
    </div>
  )
}
