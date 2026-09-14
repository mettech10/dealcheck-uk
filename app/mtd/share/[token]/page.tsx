"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { Toaster } from "@/components/ui/sonner"
import { MtdDisclaimerBanner } from "@/components/mtd/disclaimer-banner"
import { PackSummary } from "@/components/mtd/pack-summary"
import { downloadSharedPack, fetchSharedPack } from "@/lib/mtd/client"
import type { FlaskQuarterPack } from "@/lib/mtd/types"
import { toast } from "sonner"

export default function MtdPublicSharePage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [pack, setPack] = useState<FlaskQuarterPack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSharedPack(token)
      .then((j) => {
        if (cancelled) return
        setPack(j.pack)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "This link is not valid.")
        setPack(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const download = async (format: "csv" | "json" | "pdf") => {
    setDownloading(true)
    try {
      await downloadSharedPack(token, format)
      toast.success("Working papers downloaded — not an HMRC submission.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  const businessName = pack?.snapshot?.business?.name || "UK property business"

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <ToolsTopBar />
      <Toaster />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Accountant view</h1>
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Read-only · not HMRC software
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {businessName}
          {pack ? ` · ${pack.taxYear} Q${pack.quarter}` : ""} — working papers shared via Metalyzi.
          You cannot edit the ledger from this link.
        </p>
      </div>
      <MtdDisclaimerBanner />

      {error ? (
        <div className="rounded-lg border border-border/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/mtd" className="mt-3 inline-block text-sm underline">
            Sign in to MTD Pack
          </Link>
        </div>
      ) : loading || !pack ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading pack…</div>
      ) : (
        <PackSummary
          pack={pack}
          onDownload={(f) => void download(f)}
          downloading={downloading}
        />
      )}
    </div>
  )
}
