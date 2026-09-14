"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, Download, Link2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MtdWorkspaceShell } from "@/components/mtd/workspace-shell"
import { fetchBusiness, fetchPack, fetchProperties, mtdFetch } from "@/lib/mtd/client"
import { quarterFromDate, quarterPeriod } from "@/lib/mtd/taxYear"
import { formatGbp } from "@/lib/mtd/money"
import type { MtdBusiness, MtdPack, MtdProperty } from "@/lib/mtd/types"

export default function MtdOverviewPage() {
  return (
    <MtdWorkspaceShell
      title="MTD Pack"
      description="Digital ledger and quarterly working papers for one UK property business. Several properties, one business — propertyId is the source of truth."
    >
      <OverviewBody />
    </MtdWorkspaceShell>
  )
}

function OverviewBody() {
  const [business, setBusiness] = useState<MtdBusiness | null>(null)
  const [properties, setProperties] = useState<MtdProperty[]>([])
  const [pack, setPack] = useState<MtdPack | null>(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const { taxYear, quarter } = quarterFromDate(new Date())
  const period = quarterPeriod(taxYear, quarter)

  const reload = async () => {
    const [b, p, pk] = await Promise.all([
      fetchBusiness(),
      fetchProperties(),
      fetchPack(taxYear, String(quarter)).catch(() => null),
    ])
    setBusiness(b.business)
    setName(b.business.name)
    setProperties(p.properties)
    setPack(pk?.pack ?? null)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveName = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const j = await mtdFetch("/business", {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      })
      setBusiness(j.business)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label={period?.label ?? "Current quarter"}
          value={formatGbp(pack?.totals.netWorkingPapers ?? 0)}
          sub={`${pack?.totals.entryCount ?? 0} entries · ${taxYear}`}
        />
        <Kpi label="Income this quarter" value={formatGbp(pack?.totals.income ?? 0)} />
        <Kpi label="Expenses this quarter" value={formatGbp(pack?.totals.expenses ?? 0)} />
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
            Cash basis is the default for MTD Pack v1.
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
                {business?.accounting_basis ?? "cash"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Properties in this business</CardTitle>
          <CardDescription>
            Properties come from Portfolio Tracker. MTD Pack does not create properties.
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
                  key={p.propertyId}
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
                      propertyId {p.propertyId}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link href={`/mtd/ledger?propertyId=${p.propertyId}`}>
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
