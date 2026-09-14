"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, Download, Link2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MtdWorkspaceShell } from "@/components/mtd/workspace-shell"
import {
  fetchPortfolioProperties,
  listLedger,
  updateBusiness,
} from "@/lib/mtd/client"
import { getCategory } from "@/lib/mtd/categories"
import { formatGbpFromPence } from "@/lib/mtd/money"
import { incomeExpenseFromTotals } from "@/lib/mtd/snapshot"
import { isDateInPeriod, quarterFromDate, quarterPeriod } from "@/lib/mtd/taxYear"
import { useMtdBusiness } from "@/lib/mtd/workspace-context"
import type { FlaskLedgerEntry, PortfolioProperty } from "@/lib/mtd/types"

export default function MtdOverviewPage() {
  return (
    <MtdWorkspaceShell
      title="MTD Pack"
      description="Digital ledger and quarterly working papers for one UK property business. Ledger writes go to Flask /v1/mtd/* — propertyId is the Metalyzi portfolio UUID."
    >
      <OverviewBody />
    </MtdWorkspaceShell>
  )
}

function OverviewBody() {
  const business = useMtdBusiness()
  const [name, setName] = useState(business.name)
  const [saving, setSaving] = useState(false)
  const [properties, setProperties] = useState<PortfolioProperty[]>([])
  const [entries, setEntries] = useState<FlaskLedgerEntry[]>([])

  const { taxYear, quarter } = quarterFromDate(new Date())
  const period = quarterPeriod(taxYear, quarter)

  useEffect(() => {
    ;(async () => {
      try {
        const [portfolio, ledger] = await Promise.all([
          fetchPortfolioProperties(),
          listLedger(business.id),
        ])
        setProperties(portfolio)
        setEntries(ledger)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load MTD overview")
      }
    })()
  }, [business.id])

  const periodEntries = period
    ? entries.filter((row) => isDateInPeriod(row.entryDate, period.start, period.end))
    : []
  const totals: Record<string, number> = {}
  for (const row of periodEntries) {
    totals[row.categoryCode] = (totals[row.categoryCode] || 0) + row.amountPence
  }
  const { income, expenses, net } = incomeExpenseFromTotals(totals)
  const residential = periodEntries
    .filter((row) => getCategory(row.categoryCode)?.isResidentialFinance)
    .reduce((sum, row) => sum + row.amountPence, 0)

  const saveName = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateBusiness(business.id, { name: name.trim() })
      toast.success("Business name saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save name")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label={period?.label ?? "Current quarter"}
          value={formatGbpFromPence(net)}
          sub={`${periodEntries.length} entries · ${taxYear} · Flask ledger`}
        />
        <Kpi label="Income this quarter" value={formatGbpFromPence(income)} />
        <Kpi
          label="Expenses this quarter"
          value={formatGbpFromPence(expenses)}
          sub={
            residential
              ? `Residential finance ${formatGbpFromPence(residential)} is not a profit deduction`
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="gap-1.5">
          <Link href="/mtd/ledger">
            <Plus className="size-4" />
            Add ledger entry
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/mtd/pack">
            <Download className="size-4" />
            Quarterly pack
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/mtd/share">
            <Link2 className="size-4" />
            Share with accountant
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">UK property business</CardTitle>
          <CardDescription>
            HMRC treats UK property as one property business even when you have several lets.
            Totals come from Flask `mtd_*` tables — Metalyzi does not keep a second ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="biz-name">Business name</Label>
              <div className="flex gap-2">
                <Input
                  id="biz-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button variant="outline" onClick={() => void saveName()} disabled={saving}>
                  Save
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Accounting basis</Label>
              <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm capitalize">
                {business.basis}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Properties in this business</CardTitle>
          <CardDescription>
            Properties come from Portfolio Tracker. Create/link on Flask requires the platform
            propertyId — MTD Pack does not invent properties.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No portfolio properties yet. Add a let in Portfolio Tracker, then record income
                and expenses here against that propertyId.
              </p>
              <Button asChild variant="outline">
                <Link href="/tools/portfolio">Open Portfolio Tracker</Link>
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {properties.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-card/40 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{p.nickname || p.address}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.address}
                      {p.postcode ? ` · ${p.postcode}` : ""}
                      {p.strategy ? ` · ${p.strategy}` : ""}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      propertyId {p.id}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link href={`/mtd/ledger?propertyId=${p.id}`}>
                      <BookOpen className="size-3.5" />
                      Ledger
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </Card>
  )
}
