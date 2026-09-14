"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { Toaster } from "@/components/ui/sonner"
import { MtdDisclaimerBanner } from "@/components/mtd/disclaimer-banner"
import { PackSummary } from "@/components/mtd/pack-summary"
import { downloadPackFile, fetchSharedPack } from "@/lib/mtd/client"
import { currentTaxYear, quarterFromDate, recentTaxYears } from "@/lib/mtd/taxYear"
import type { MtdPack, MtdQuarterId } from "@/lib/mtd/types"
import { toast } from "sonner"

export default function MtdPublicSharePage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const current = quarterFromDate(new Date())
  const [taxYear, setTaxYear] = useState(current.taxYear)
  const [quarter, setQuarter] = useState<MtdQuarterId>(current.quarter)
  const [pack, setPack] = useState<MtdPack | null>(null)
  const [meta, setMeta] = useState<{ name: string; label: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const years = recentTaxYears()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSharedPack(token, taxYear, String(quarter))
      .then((j) => {
        if (cancelled) return
        setPack(j.pack)
        setMeta({ name: j.business.name, label: j.label })
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
  }, [token, taxYear, quarter])

  const download = async (format: "csv" | "json") => {
    setDownloading(true)
    try {
      await downloadPackFile({ taxYear, quarter: String(quarter), format, token })
      toast.success("Working papers downloaded — not an HMRC submission.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

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
          {meta?.label ? `${meta.label} · ` : ""}
          {meta?.name ?? "UK property business"} — working papers shared via Metalyzi. You cannot
          edit the ledger from this link.
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
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div>
              <Label>Tax year</Label>
              <Select value={taxYear} onValueChange={setTaxYear}>
                <SelectTrigger className="mt-1.5 min-w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.taxYear} value={y.taxYear}>
                      {y.taxYear}
                      {y.taxYear === currentTaxYear().taxYear ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period</Label>
              <Select
                value={String(quarter)}
                onValueChange={(v) =>
                  setQuarter((v === "year" ? "year" : Number(v)) as MtdQuarterId)
                }
              >
                <SelectTrigger className="mt-1.5 min-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1 (6 Apr – 5 Jul)</SelectItem>
                  <SelectItem value="2">Q2 (6 Jul – 5 Oct)</SelectItem>
                  <SelectItem value="3">Q3 (6 Oct – 5 Jan)</SelectItem>
                  <SelectItem value="4">Q4 (6 Jan – 5 Apr)</SelectItem>
                  <SelectItem value="year">Full tax year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {loading || !pack ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading pack…</div>
          ) : (
            <PackSummary
              pack={pack}
              onDownload={(f) => void download(f)}
              downloading={downloading}
            />
          )}
        </>
      )}
    </div>
  )
}
