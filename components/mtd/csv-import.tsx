"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CategoryPicker } from "./category-picker"
import { parseLedgerCsv } from "@/lib/mtd/csv"
import { importLedgerRows } from "@/lib/mtd/client"
import { formatGbp } from "@/lib/mtd/money"
import type { MtdProperty, ParsedCsvRow } from "@/lib/mtd/types"

export function CsvImportDialog({
  open,
  onOpenChange,
  properties,
  defaultPropertyId,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: MtdProperty[]
  defaultPropertyId?: string
  onImported: () => void
}) {
  const [rows, setRows] = useState<ParsedCsvRow[]>([])
  const [filename, setFilename] = useState<string | null>(null)
  const [fallbackPropertyId, setFallbackPropertyId] = useState(defaultPropertyId || "")
  const [busy, setBusy] = useState(false)

  const readyCount = useMemo(
    () =>
      rows.filter((r) => {
        const pid = r.propertyId || fallbackPropertyId
        return r.entryDate && r.amount > 0 && r.categoryId && r.description && pid
      }).length,
    [rows, fallbackPropertyId],
  )

  const reset = () => {
    setRows([])
    setFilename(null)
    setBusy(false)
  }

  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parseLedgerCsv(text)
      setRows(parsed)
      setFilename(file.name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse CSV")
    }
  }

  const patchRow = (line: number, patch: Partial<ParsedCsvRow>) => {
    setRows((prev) => prev.map((r) => (r.line === line ? { ...r, ...patch, warnings: [] } : r)))
  }

  const importRows = async () => {
    const payload = rows
      .map((r) => ({
        propertyId: r.propertyId || fallbackPropertyId,
        entryDate: r.entryDate,
        amount: r.amount,
        categoryId: r.categoryId || "",
        description: r.description,
        reference: r.reference,
      }))
      .filter((r) => r.propertyId && r.entryDate && r.amount > 0 && r.categoryId && r.description)

    if (payload.length === 0) {
      toast.error("Fix highlighted rows before importing.")
      return
    }
    setBusy(true)
    try {
      const result = await importLedgerRows({ rows: payload })
      if (result.errors?.length) {
        toast.message(`Imported ${result.imported}. ${result.errors.length} row(s) skipped.`)
      } else {
        toast.success(`Imported ${result.imported} ledger ${result.imported === 1 ? "entry" : "entries"}`)
      }
      reset()
      onOpenChange(false)
      onImported()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import CSV ledger</DialogTitle>
          <DialogDescription>
            Map each row to a portfolio property (`propertyId`) and an SA105 category. Nothing
            is sent to HMRC.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csv-file">CSV file</Label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onFile(file)
              }}
            />
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/v1/mtd/ledger/template">Download template</a>
          </Button>
          <div className="min-w-[220px] flex-1">
            <Label>Default property</Label>
            <Select value={fallbackPropertyId || undefined} onValueChange={setFallbackPropertyId}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue placeholder="Assign rows without property_id" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.propertyId} value={p.propertyId}>
                    {p.nickname || p.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filename && (
          <p className="text-xs text-muted-foreground">
            {filename} · {rows.length} rows · {readyCount} ready to import
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/50">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <Upload className="size-8 opacity-50" />
              Choose a CSV with date, amount, description, and optionally category, property_id,
              reference.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 text-left">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Property</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pid = r.propertyId || fallbackPropertyId
                  const bad = !r.entryDate || !r.categoryId || !r.description || !pid || r.amount <= 0
                  return (
                    <tr key={r.line} className={bad ? "bg-destructive/5" : ""}>
                      <td className="px-2 py-1.5 tabular-nums">{r.entryDate || "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums">{formatGbp(r.amount)}</td>
                      <td className="max-w-[180px] truncate px-2 py-1.5" title={r.description}>
                        {r.description || "—"}
                      </td>
                      <td className="min-w-[220px] px-2 py-1.5">
                        <CategoryPicker
                          value={r.categoryId || ""}
                          onChange={(id) => patchRow(r.line, { categoryId: id })}
                        />
                      </td>
                      <td className="min-w-[180px] px-2 py-1.5">
                        <Select
                          value={pid || undefined}
                          onValueChange={(id) => patchRow(r.line, { propertyId: id })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Property" />
                          </SelectTrigger>
                          <SelectContent>
                            {properties.map((p) => (
                              <SelectItem key={p.propertyId} value={p.propertyId}>
                                {p.nickname || p.address}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void importRows()} disabled={busy || readyCount === 0}>
            {busy ? "Importing…" : `Import ${readyCount} ${readyCount === 1 ? "row" : "rows"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
