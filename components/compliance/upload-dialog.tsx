"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { COMPLIANCE_CATALOGUE } from "@/lib/compliance/catalogue"
import { toIsoDate, addMonths } from "@/lib/compliance/status"
import type { ObligationCode, UploadEvidenceInput } from "@/lib/compliance/types"

export function UploadEvidenceDialog({
  open,
  onOpenChange,
  code,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  code: ObligationCode
  onSubmit: (input: UploadEvidenceInput) => Promise<void>
}) {
  const def = COMPLIANCE_CATALOGUE[code]
  const [file, setFile] = useState<File | null>(null)
  const [issuedOn, setIssuedOn] = useState("")
  const [expiresOn, setExpiresOn] = useState("")
  const [notes, setNotes] = useState("")
  const [schemeRef, setSchemeRef] = useState("")
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setFile(null)
    setIssuedOn("")
    setExpiresOn("")
    setNotes("")
    setSchemeRef("")
  }

  const suggestExpiry = (issued: string) => {
    setIssuedOn(issued)
    if (!issued || !def.typicalValidityMonths || expiresOn) return
    const [y, m, d] = issued.split("-").map(Number)
    const start = new Date(y, (m ?? 1) - 1, d ?? 1)
    setExpiresOn(toIsoDate(addMonths(start, def.typicalValidityMonths)))
  }

  const handleSave = async () => {
    if (def.expiryModel === "fixed_term" && !expiresOn && !file) {
      toast.error("Add an expiry date or attach the certificate")
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        file,
        issuedOn: issuedOn || null,
        expiresOn: expiresOn || null,
        notes: notes || null,
        schemeRef: schemeRef || null,
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log {def.shortName}</DialogTitle>
          <DialogDescription>
            Attach a scan or just record the dates. Typical validity:{" "}
            {def.typicalValidity ?? "see notes"}. This is a record for your
            file — not a legal filing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evidence-file">Certificate / evidence (optional)</Label>
            <Input
              id="evidence-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">
              PDF or image, typically under 10 MB. The stub stores metadata
              only until the backend is live.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issued-on">Issued on</Label>
              <Input
                id="issued-on"
                type="date"
                value={issuedOn}
                onChange={(e) => suggestExpiry(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expires-on">Expires on</Label>
              <Input
                id="expires-on"
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </div>
          </div>

          {code === "DEP" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheme-ref">Scheme reference</Label>
              <Input
                id="scheme-ref"
                placeholder="e.g. DPS / TDS / MyDeposits ref"
                value={schemeRef}
                onChange={(e) => setSchemeRef(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evidence-notes">Notes</Label>
            <Textarea
              id="evidence-notes"
              rows={3}
              placeholder="Engineer, scheme, tenancy, or anything to remember"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Upload className="size-4" />
            {saving ? "Saving…" : "Save to file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
