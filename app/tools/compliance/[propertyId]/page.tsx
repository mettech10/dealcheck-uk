"use client"

/**
 * /tools/compliance/[propertyId] — per-property compliance file.
 *
 * Obligation rows from the MVP catalogue, upload UI, expiry dates,
 * and applicability (including N/A). Linked via portfolio `propertyId`.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  FileText,
  Trash2,
  Upload,
  ShieldCheck,
} from "lucide-react"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { ComplianceDisclaimerBanner } from "@/components/compliance/disclaimer-banner"
import {
  TrafficLightBadge,
  TrafficLightDot,
} from "@/components/compliance/traffic-light"
import { UploadEvidenceDialog } from "@/components/compliance/upload-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COMPLIANCE_CATALOGUE } from "@/lib/compliance/catalogue"
import { getComplianceClient, type ComplianceSource } from "@/lib/compliance/client"
import type { ComplianceApi } from "@/lib/compliance/stub"
import { propertyLabel } from "@/lib/compliance/status"
import type {
  Applicability,
  ObligationCode,
  ObligationState,
  PropertyComplianceFile,
  UploadEvidenceInput,
} from "@/lib/compliance/types"
import {
  toPropertyRef,
  useComplianceSession,
} from "@/hooks/use-compliance-session"

export default function PropertyCompliancePage() {
  const params = useParams<{ propertyId: string }>()
  const propertyId = params.propertyId
  const { authChecked, isLoggedIn, userId, properties, loading } =
    useComplianceSession()
  const portfolioRow = properties.find((p) => p.id === propertyId)

  const [api, setApi] = useState<ComplianceApi | null>(null)
  const [source, setSource] = useState<ComplianceSource>("stub")
  const [file, setFile] = useState<PropertyComplianceFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadCode, setUploadCode] = useState<ObligationCode | null>(null)

  const ref = useMemo(
    () => (portfolioRow ? toPropertyRef(portfolioRow) : null),
    [portfolioRow],
  )

  useEffect(() => {
    if (!isLoggedIn) return
    let cancelled = false
    ;(async () => {
      const handle = await getComplianceClient({ userId: userId ?? "local" })
      if (cancelled) return
      setApi(handle.api)
      setSource(handle.source)
    })()
    return () => {
      cancelled = true
    }
  }, [isLoggedIn, userId])

  const loadFile = useCallback(async () => {
    if (!api || !ref) return
    setBusy(true)
    try {
      const next = await api.upsertProperty(ref)
      setFile(next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load file")
    } finally {
      setBusy(false)
    }
  }, [api, ref])

  useEffect(() => {
    if (api && ref) void loadFile()
  }, [api, ref, loadFile])

  if (!authChecked) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <ToolsTopBar />
        <div className="flex flex-col gap-6 pt-6 text-center">
          <ShieldCheck className="mx-auto size-12 text-primary" />
          <h1 className="text-2xl font-bold">Compliance file</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to view this property&apos;s compliance file.
          </p>
          <Button asChild>
            <Link href={`/login?redirect=/tools/compliance/${propertyId}`}>Sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <ToolsTopBar />

      <div>
        <Link
          href="/tools/compliance"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to cockpit
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading property…</div>
      ) : !portfolioRow ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No portfolio property matches <code>propertyId</code>{" "}
              <span className="text-foreground">{propertyId}</span>. Add it in
              Portfolio Tracker first so the compliance file can link.
            </p>
            <div className="flex justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/tools/portfolio">Open portfolio</Link>
              </Button>
              <Button asChild>
                <Link href="/tools/compliance">Cockpit</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  {propertyLabel(ref!)}
                </h1>
                {file && <TrafficLightBadge status={file.overallStatus} />}
              </div>
              <p className="text-sm text-muted-foreground">
                {portfolioRow.address}
                {portfolioRow.postcode ? `, ${portfolioRow.postcode}` : ""}
                {portfolioRow.strategy ? ` · ${portfolioRow.strategy}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                propertyId: {propertyId}
                {source === "stub" ? " · on-device stub" : ""}
              </p>
            </div>
          </div>

          <ComplianceDisclaimerBanner compact />

          {busy && !file ? (
            <div className="text-sm text-muted-foreground">Opening file…</div>
          ) : (
            <div className="flex flex-col gap-3">
              {(file?.obligations ?? []).map((row) => (
                <ObligationRow
                  key={row.code}
                  row={row}
                  disabled={!api}
                  onApplicability={async (applicability) => {
                    if (!api) return
                    try {
                      const next = await api.patchObligation(propertyId, row.code, {
                        applicability,
                      })
                      setFile(next)
                      toast.success(`${row.code} updated`)
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Update failed")
                    }
                  }}
                  onUpload={() => setUploadCode(row.code)}
                  onDeleteEvidence={async (evidenceId) => {
                    if (!api) return
                    if (!confirm("Remove this evidence from the file?")) return
                    try {
                      const next = await api.deleteEvidence(
                        propertyId,
                        row.code,
                        evidenceId,
                      )
                      setFile(next)
                      toast.success("Evidence removed")
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Remove failed")
                    }
                  }}
                />
              ))}
            </div>
          )}

          {uploadCode && (
            <UploadEvidenceDialog
              open={!!uploadCode}
              onOpenChange={(open) => {
                if (!open) setUploadCode(null)
              }}
              code={uploadCode}
              onSubmit={async (input: UploadEvidenceInput) => {
                if (!api || !uploadCode) return
                const next = await api.uploadEvidence(propertyId, uploadCode, input)
                setFile(next)
                toast.success("Saved to the property file")
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function ObligationRow({
  row,
  disabled,
  onApplicability,
  onUpload,
  onDeleteEvidence,
}: {
  row: ObligationState
  disabled: boolean
  onApplicability: (value: Applicability) => Promise<void>
  onUpload: () => void
  onDeleteEvidence: (id: string) => Promise<void>
}) {
  const def = COMPLIANCE_CATALOGUE[row.code]
  const latest = row.evidence[row.evidence.length - 1] ?? null

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <TrafficLightDot status={row.status} size="lg" className="mt-1" />
            <div>
              <CardTitle className="text-base">{def.name}</CardTitle>
              <CardDescription>
                {def.typicalValidity} · {def.expiryModel.replace("_", " ")}
              </CardDescription>
            </div>
          </div>
          <TrafficLightBadge status={row.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{def.legalNote}</p>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Applies to this property
            </span>
            <Select
              value={row.applicability}
              onValueChange={(v) => onApplicability(v as Applicability)}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="unknown">Check / unknown</SelectItem>
                <SelectItem value="not_applicable">Not applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-right text-xs text-muted-foreground">
            {row.latestExpiry ? (
              <div>
                Expires{" "}
                <span className="font-medium text-foreground">{row.latestExpiry}</span>
                {row.daysUntilExpiry != null && (
                  <span>
                    {" "}
                    ({row.daysUntilExpiry < 0
                      ? `${Math.abs(row.daysUntilExpiry)} days overdue`
                      : `${row.daysUntilExpiry} days left`}
                    )
                  </span>
                )}
              </div>
            ) : row.applicability === "required" ? (
              <div>No certificate logged</div>
            ) : null}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onUpload}
            disabled={disabled || row.applicability === "not_applicable"}
          >
            <Upload className="size-3.5" />
            Upload / log dates
          </Button>
        </div>

        {row.evidence.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-md border border-border/40 bg-background/40 p-2">
            {row.evidence.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {ev.filename || "Dates only"}
                    {ev.schemeRef ? ` · ${ev.schemeRef}` : ""}
                    {ev.expiresOn ? ` · exp ${ev.expiresOn}` : ""}
                    {ev.issuedOn ? ` · issued ${ev.issuedOn}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteEvidence(ev.id)}
                  aria-label="Remove evidence"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {latest && (
          <Badge variant="secondary" className="w-fit font-normal">
            Last logged {new Date(latest.uploadedAt).toLocaleDateString("en-GB")}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
