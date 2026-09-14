"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MtdWorkspaceShell } from "@/components/mtd/workspace-shell"
import { PackSummary } from "@/components/mtd/pack-summary"
import { downloadPackExport, ensureQuarterPack } from "@/lib/mtd/client"
import { currentTaxYear, quarterFromDate, quarterPeriod, recentTaxYears } from "@/lib/mtd/taxYear"
import { useMtdBusiness } from "@/lib/mtd/workspace-context"
import type { FlaskQuarterPack } from "@/lib/mtd/types"

export default function MtdPackPage() {
  return (
    <MtdWorkspaceShell
      title="Quarterly pack"
      description="Immutable SA105-aligned snapshot from Flask POST /v1/mtd/businesses/:id/packs. Downloads are working papers — Metalyzi never files them with HMRC."
    >
      <PackBody />
    </MtdWorkspaceShell>
  )
}

function PackBody() {
  const business = useMtdBusiness()
  const current = quarterFromDate(new Date())
  const [taxYear, setTaxYear] = useState(current.taxYear)
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(current.quarter)
  const [pack, setPack] = useState<FlaskQuarterPack | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const years = recentTaxYears()
  const period = quarterPeriod(taxYear, quarter)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ensureQuarterPack(business.id, taxYear, quarter)
      .then((j) => {
        if (!cancelled) setPack(j)
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load pack")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [business.id, taxYear, quarter])

  const download = async (format: "csv" | "json" | "pdf") => {
    if (!pack) return
    setDownloading(true)
    try {
      await downloadPackExport(pack.id, format)
      toast.success("Working papers downloaded — this is not an HMRC submission.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  return (
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
            onValueChange={(v) => setQuarter(Number(v) as 1 | 2 | 3 | 4)}
          >
            <SelectTrigger className="mt-1.5 min-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1 (6 Apr – 5 Jul)</SelectItem>
              <SelectItem value="2">Q2 (6 Jul – 5 Oct)</SelectItem>
              <SelectItem value="3">Q3 (6 Oct – 5 Jan)</SelectItem>
              <SelectItem value="4">Q4 (6 Jan – 5 Apr)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period && (
          <p className="self-end pb-2 text-xs text-muted-foreground">
            {period.label}: {pack?.periodStart ?? ""} → {pack?.periodEnd ?? ""}
          </p>
        )}
      </div>

      {loading || !pack ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Building pack on Flask…</div>
      ) : (
        <PackSummary pack={pack} onDownload={(f) => void download(f)} downloading={downloading} />
      )}
    </>
  )
}
