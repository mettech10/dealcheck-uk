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

export function MtdWorkspaceShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  const [state, setState] = useState<"loading" | "anon" | "ready" | "migration">("loading")

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/v1/mtd/business")
        if (res.status === 401) {
          setState("anon")
          return
        }
        if (res.status === 503) {
          setState("migration")
          return
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          toast.error((j as { error?: string }).error || "Failed to load MTD Pack")
          setState("anon")
          return
        }
        setState("ready")
      } catch {
        setState("anon")
      }
    })()
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
              <Link href="/login?redirect=/mtd">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      )}

      {state === "migration" && (
        <div className="flex flex-col gap-4 pt-6">
          <h1 className="text-2xl font-bold">MTD Pack</h1>
          <p className="text-sm text-muted-foreground">
            The MTD Pack database tables have not been applied yet. Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              supabase/migrations/20260914_mtd_pack.sql
            </code>{" "}
            and reload.
          </p>
        </div>
      )}

      {state === "ready" && (
        <>
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
        </>
      )}
    </div>
  )
}
