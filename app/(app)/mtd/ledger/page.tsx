"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Plus, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MtdWorkspaceShell } from "@/components/mtd/workspace-shell"
import { CategoryPicker } from "@/components/mtd/category-picker"
import { CsvImportDialog } from "@/components/mtd/csv-import"
import {
  createLedgerEntry,
  deleteLedgerEntry,
  fetchPortfolioProperties,
  listFlaskProperties,
  listLedger,
} from "@/lib/mtd/client"
import { getCategory } from "@/lib/mtd/categories"
import { entryCountLabel } from "@/lib/mtd/copy"
import { formatGbpFromPence } from "@/lib/mtd/money"
import { useMtdBusiness } from "@/lib/mtd/workspace-context"
import type { FlaskLedgerEntry, FlaskMtdProperty, PortfolioProperty } from "@/lib/mtd/types"

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function LedgerInner() {
  const business = useMtdBusiness()
  const searchParams = useSearchParams()
  const initialProperty = searchParams.get("propertyId") || "all"
  const [propertyFilter, setPropertyFilter] = useState(initialProperty)
  const [properties, setProperties] = useState<PortfolioProperty[]>([])
  const [flaskProperties, setFlaskProperties] = useState<FlaskMtdProperty[]>([])
  const [entries, setEntries] = useState<FlaskLedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)

  const [entryDate, setEntryDate] = useState(todayIso)
  const [amount, setAmount] = useState("")
  const [categoryCode, setCategoryCode] = useState("")
  const [description, setDescription] = useState("")
  const [reference, setReference] = useState("")
  const [formPropertyId, setFormPropertyId] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [portfolio, flask, ledger] = await Promise.all([
        fetchPortfolioProperties(),
        listFlaskProperties(business.id),
        listLedger(business.id),
      ])
      setProperties(portfolio)
      setFlaskProperties(flask)
      setEntries(ledger)
      setFormPropertyId((current) => {
        if (current) return current
        const fromUrl = initialProperty !== "all" ? initialProperty : ""
        return fromUrl || portfolio[0]?.id || ""
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }, [business.id, initialProperty])

  useEffect(() => {
    void load()
  }, [load])

  const flaskByPk = useMemo(() => {
    const map = new Map(flaskProperties.map((p) => [p.id, p]))
    return map
  }, [flaskProperties])

  const platformLabel = useMemo(() => {
    const map = new Map(properties.map((p) => [p.id, p.nickname || p.address]))
    return (platformId: string | null | undefined) =>
      (platformId && map.get(platformId)) || platformId?.slice(0, 8) || "—"
  }, [properties])

  const visibleEntries = useMemo(() => {
    if (propertyFilter === "all") return entries
    return entries.filter((row) => {
      const linked = flaskByPk.get(row.propertyId || "")
      return linked?.propertyId === propertyFilter
    })
  }, [entries, propertyFilter, flaskByPk])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formPropertyId) {
      toast.error("Choose a property. Add one in Portfolio Tracker if the list is empty.")
      return
    }
    const n = Number(amount)
    if (!Number.isFinite(n) || n === 0) {
      toast.error("Enter an amount in pounds (converted to pence on Flask).")
      return
    }
    if (!categoryCode) {
      toast.error("Pick an SA105 category.")
      return
    }
    setSaving(true)
    try {
      await createLedgerEntry({
        businessId: business.id,
        platformPropertyId: formPropertyId,
        date: entryDate,
        amountPounds: n,
        categoryCode,
        description,
        reference: reference || undefined,
      })
      toast.success("Ledger entry saved on Flask")
      setAmount("")
      setDescription("")
      setReference("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save entry")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm("Delete this ledger entry?")) return
    try {
      await deleteLedgerEntry(id)
      toast.success("Entry deleted")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Add entry</CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" />
              Import CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add at least one property in{" "}
              <Link href="/tools/portfolio" className="underline">
                Portfolio Tracker
              </Link>{" "}
              before recording income or expenses. Flask create/link requires that platform
              propertyId.
            </p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Date" htmlFor="entry-date">
                <Input
                  id="entry-date"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </Field>
              <Field label="Property" htmlFor="entry-property">
                <Select value={formPropertyId || undefined} onValueChange={setFormPropertyId}>
                  <SelectTrigger id="entry-property" className="w-full">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nickname || p.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="SA105 category" htmlFor="entry-category">
                <CategoryPicker id="entry-category" value={categoryCode} onChange={setCategoryCode} />
              </Field>
              <Field label="Amount (£)" htmlFor="entry-amount">
                <Input
                  id="entry-amount"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Description" htmlFor="entry-desc">
                <Input
                  id="entry-desc"
                  required
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. April rent — 14 Acacia Avenue"
                />
              </Field>
              <Field label="Reference (optional)" htmlFor="entry-ref">
                <Input
                  id="entry-ref"
                  maxLength={120}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Invoice or bank ref"
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={saving} className="gap-1.5">
                  <Plus className="size-4" />
                  {saving ? "Saving…" : "Save entry"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px]">
          <Label>Filter by property</Label>
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="mt-1.5 w-full min-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties in this business</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nickname || p.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{entryCountLabel(visibleEntries.length)} · Flask /v1/mtd</p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading ledger…</div>
          ) : visibleEntries.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No entries yet. Add one above or import a CSV.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((e) => {
                  const cat = getCategory(e.categoryCode)
                  const linked = flaskByPk.get(e.propertyId || "")
                  return (
                    <tr key={e.id} className="border-t border-border/40">
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        {e.entryDate}
                      </td>
                      <td className="px-4 py-2.5">{platformLabel(linked?.propertyId)}</td>
                      <td className="px-4 py-2.5">
                        <div>{cat?.name ?? e.categoryCode}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {cat?.sa105Box ? `Box ${cat.sa105Box}` : ""} {cat?.kind}
                          {cat?.isResidentialFinance ? " · not a profit deduction" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div>{e.description}</div>
                        {e.counterparty && (
                          <div className="text-[11px] text-muted-foreground">{e.counterparty}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatGbpFromPence(e.amountPence)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => void remove(e.id)}
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        businessId={business.id}
        properties={properties}
        defaultPropertyId={formPropertyId}
        onImported={() => void load()}
      />
    </>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

export default function MtdLedgerPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Loading…</div>}>
      <MtdWorkspaceShell
        title="Ledger"
        description="Manual entries and CSV import, categorised to SA105 boxes. Each row is stored on Flask against a linked platform propertyId."
      >
        <LedgerInner />
      </MtdWorkspaceShell>
    </Suspense>
  )
}
