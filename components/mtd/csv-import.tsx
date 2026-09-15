"use client"

import { useEffect, useState } from "react"
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
import {
  commitCsv,
  downloadCsvTemplate,
  linkPlatformProperty,
  previewCsv,
} from "@/lib/mtd/client"
import { requirePlatformPropertyId } from "@/lib/mtd/config"
import { injectPropertyId } from "@/lib/mtd/csv"
import { formatGbpFromPence } from "@/lib/mtd/money"
import type { FlaskCsvPreview, PortfolioProperty } from "@/lib/mtd/types"

export function CsvImportDialog({
  open,
  onOpenChange,
  businessId,
  properties,
  defaultPropertyId,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  properties: PortfolioProperty[]
  defaultPropertyId?: string
  onImported: () => void
}) {
  const [rawCsv, setRawCsv] = useState("")
  const [filename, setFilename] = useState<string | null>(null)
  const [fallbackPropertyId, setFallbackPropertyId] = useState(defaultPropertyId || "")
  const [preview, setPreview] = useState<FlaskCsvPreview | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (defaultPropertyId && !fallbackPropertyId) setFallbackPropertyId(defaultPropertyId)
  }, [defaultPropertyId, fallbackPropertyId])

  const reset = () => {
    setRawCsv("")
    setFilename(null)
    setPreview(null)
    setBusy(false)
  }

  const runPreview = async (text: string, propertyId: string, name: string) => {
    const id = requirePlatformPropertyId(propertyId)
    const prop = properties.find((p) => p.id === id)
    if (!prop) throw new Error("propertyId was not found in your Metalyzi portfolio.")
    await linkPlatformProperty({
      businessId,
      propertyId: id,
      label: prop.nickname || prop.address,
      address: prop.address,
      postcode: prop.postcode,
    })
    const injected = injectPropertyId(text, id)
    const result = await previewCsv(businessId, injected, name)
    setPreview(result)
    return injected
  }

  const onFile = async (file: File) => {
    try {
      if (!fallbackPropertyId) {
        toast.error("Choose a portfolio property first. Flask import requires property_id.")
        return
      }
      const text = await file.text()
      setRawCsv(text)
      setFilename(file.name)
      await runPreview(text, fallbackPropertyId, file.name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not preview CSV on Flask")
    }
  }

  useEffect(() => {
    if (!open || !rawCsv || !fallbackPropertyId || !filename) return
    void runPreview(rawCsv, fallbackPropertyId, filename).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Could not preview CSV on Flask")
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackPropertyId])

  const importRows = async () => {
    try {
      const propertyId = requirePlatformPropertyId(fallbackPropertyId)
      if (!rawCsv) {
        toast.error("Choose a CSV file.")
        return
      }
      setBusy(true)
      const injected = injectPropertyId(rawCsv, propertyId)
      const result = await commitCsv(businessId, injected, filename || "import.csv")
      toast.success(
        result.idempotent
          ? `Already imported (${result.createdCount} created, ${result.skippedCount} skipped)`
          : `Imported ${result.createdCount} ledger ${result.createdCount === 1 ? "entry" : "entries"} on Flask`,
      )
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
            Flask preview + idempotent commit. Each row needs a Metalyzi portfolio property_id.
            Nothing is sent to HMRC.
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
          <Button type="button" variant="outline" size="sm" onClick={() => downloadCsvTemplate()}>
            Download template
          </Button>
          <div className="min-w-[220px] flex-1">
            <Label>Default property</Label>
            <Select value={fallbackPropertyId || undefined} onValueChange={setFallbackPropertyId}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue placeholder="Assign rows without property_id" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nickname || p.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filename && preview && (
          <p className="text-xs text-muted-foreground">
            {filename} · {preview.rowCount} rows · {preview.validCount} ready · {preview.invalidCount}{" "}
            invalid
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/50">
          {!preview ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <Upload className="size-8 opacity-50" />
              Choose a CSV with date, property_id, category, amount_pence, description. Flask maps
              aliases such as “mortgage interest” to residential finance (box 44), not box 26.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 text-left">
                <tr>
                  <th className="px-2 py-2">Row</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} className={r.valid ? "" : "bg-destructive/5"}>
                    <td className="px-2 py-1.5 tabular-nums">{r.rowNumber}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.mapped.date || "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {typeof r.mapped.amountPence === "number"
                        ? formatGbpFromPence(r.mapped.amountPence)
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5">{r.mapped.categoryCode || "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {r.valid ? "Ready" : r.errors.join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void importRows()}
            disabled={busy || !preview?.readyToCommit || (preview.validCount ?? 0) === 0}
          >
            {busy
              ? "Importing…"
              : `Commit ${preview?.validCount ?? 0} ${(preview?.validCount ?? 0) === 1 ? "row" : "rows"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
