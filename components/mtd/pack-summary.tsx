"use client"

import { formatGbpFromPence } from "@/lib/mtd/money"
import { kindLabel } from "@/lib/mtd/categories"
import { incomeExpenseFromTotals, snapshotCategoryRows } from "@/lib/mtd/snapshot"
import type { FlaskQuarterPack } from "@/lib/mtd/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

export function PackSummary({
  pack,
  onDownload,
  downloading,
}: {
  pack: FlaskQuarterPack
  onDownload?: (format: "csv" | "json" | "pdf") => void
  downloading?: boolean
}) {
  const snapshot = pack.snapshot
  const totals = incomeExpenseFromTotals(snapshot?.periodTotalsPence)
  const rows = snapshotCategoryRows(snapshot)
  const finance = snapshot?.residentialFinance?.period
  const properties = snapshot?.properties || []
  const entries = snapshot?.entries || []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Income" value={formatGbpFromPence(totals.income)} />
        <Stat label="Expenses" value={formatGbpFromPence(totals.expenses)} />
        <Stat
          label="Working papers net"
          value={formatGbpFromPence(snapshot?.periodNetPence ?? totals.net)}
          hint="Not a tax computation"
        />
        <Stat
          label="Residential finance"
          value={formatGbpFromPence(finance?.periodPence ?? 0)}
          hint="Not a profit deduction (box 44)"
        />
      </div>

      {onDownload && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={downloading}
            onClick={() => onDownload("csv")}
          >
            <Download className="size-3.5" />
            Download CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={downloading}
            onClick={() => onDownload("json")}
          >
            <Download className="size-3.5" />
            Download JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={downloading}
            onClick={() => onDownload("pdf")}
          >
            <Download className="size-3.5" />
            Download PDF
          </Button>
          <p className="self-center text-xs text-muted-foreground">
            Working papers only — not an HMRC quarterly update.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">SA105 category totals — UK property business</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ledger entries in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3">Box</th>
                    <th className="pb-2 pr-3">Category</th>
                    <th className="pb-2 pr-3">Kind</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.code} className="border-t border-border/40">
                      <td className="py-2 pr-3 tabular-nums">{row.sa105Box ?? "—"}</td>
                      <td className="py-2 pr-3">{row.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {kindLabel(row.kind)}
                        {row.isResidentialFinance ? " · excluded from profit" : ""}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatGbpFromPence(row.periodPence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per property (same property business)</CardTitle>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add properties in Portfolio Tracker. propertyId is the source of truth.
            </p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {properties.map((slice) => {
                const sliceEntries = entries.filter((e) => e.propertyId === slice.id)
                const slicePence = sliceEntries.reduce((sum, e) => sum + e.amountPence, 0)
                return (
                  <AccordionItem key={slice.id} value={slice.id}>
                    <AccordionTrigger className="text-sm">
                      <span className="flex w-full flex-wrap items-center justify-between gap-2 pr-3">
                        <span>{slice.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {sliceEntries.length} entries · {formatGbpFromPence(slicePence)}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {sliceEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No entries this period.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {sliceEntries.map((row) => (
                              <tr key={row.id} className="border-t border-border/30">
                                <td className="py-1.5">{row.categoryCode}</td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {formatGbpFromPence(row.amountPence)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        propertyId: {slice.propertyId || "unlinked"}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </Card>
  )
}
