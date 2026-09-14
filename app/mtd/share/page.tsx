"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Copy, Link2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MtdWorkspaceShell } from "@/components/mtd/workspace-shell"
import { createShareLink, ensureQuarterPack, revokeShareLink } from "@/lib/mtd/client"
import { dropShareLink, loadShareLinks, persistShareLink } from "@/lib/mtd/shareMemory"
import { currentTaxYear, quarterFromDate, recentTaxYears } from "@/lib/mtd/taxYear"
import { useMtdBusiness } from "@/lib/mtd/workspace-context"
import type { StoredShareLink } from "@/lib/mtd/types"

export default function MtdSharePage() {
  return (
    <MtdWorkspaceShell
      title="Accountant share"
      description="Create a Flask share link for a quarterly pack, then copy a Metalyzi URL. The public page proxies GET /v1/mtd/share/:token. Metalyzi never submits to HMRC."
    >
      <ShareBody />
    </MtdWorkspaceShell>
  )
}

function ShareBody() {
  const business = useMtdBusiness()
  const current = quarterFromDate(new Date())
  const [links, setLinks] = useState<StoredShareLink[]>([])
  const [taxYear, setTaxYear] = useState(current.taxYear)
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(current.quarter)
  const [expiresInDays, setExpiresInDays] = useState("30")
  const [busy, setBusy] = useState(false)
  const years = recentTaxYears()

  useEffect(() => {
    setLinks(loadShareLinks())
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const pack = await ensureQuarterPack(business.id, taxYear, quarter)
      const j = await createShareLink(pack.id, Number(expiresInDays))
      const stored: StoredShareLink = {
        id: j.id,
        token: j.token,
        url: j.url,
        expiresAt: j.expiresAt,
        packId: pack.id,
        taxYear,
        quarter,
        createdAt: new Date().toISOString(),
      }
      persistShareLink(stored)
      setLinks(loadShareLinks())
      try {
        await navigator.clipboard.writeText(j.url)
        toast.success("Link created and copied")
      } catch {
        toast.success("Link created")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create link")
    } finally {
      setBusy(false)
    }
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  const revoke = async (id: string) => {
    if (!confirm("Revoke this accountant link? They will lose access immediately.")) return
    try {
      await revokeShareLink(id)
      dropShareLink(id)
      setLinks(loadShareLinks())
      toast.success("Link revoked")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke")
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a share link</CardTitle>
          <CardDescription>
            Flask issues an expiring token for one immutable quarter pack. Anyone with the Metalyzi
            link can view that snapshot until it expires or you revoke it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Tax year</Label>
              <Select value={taxYear} onValueChange={setTaxYear}>
                <SelectTrigger className="w-full">
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
            <div className="flex flex-col gap-1.5">
              <Label>Quarter</Label>
              <Select
                value={String(quarter)}
                onValueChange={(v) => setQuarter(Number(v) as 1 | 2 | 3 | 4)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1</SelectItem>
                  <SelectItem value="2">Q2</SelectItem>
                  <SelectItem value="3">Q3</SelectItem>
                  <SelectItem value="4">Q4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Expires</Label>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => void create()} disabled={busy} className="w-fit gap-1.5">
            <Link2 className="size-4" />
            {busy ? "Creating…" : "Create and copy link"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links created in this browser</CardTitle>
          <CardDescription>
            Flask does not list share tokens. Revoke still hits DELETE /v1/mtd/share-links/:id.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No share links yet in this session.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {links.map((link) => {
                const expired = Boolean(link.expiresAt && new Date(link.expiresAt) < new Date())
                return (
                  <li
                    key={link.id}
                    className="flex flex-col gap-2 rounded-md border border-border/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {link.taxYear ? `${link.taxYear} Q${link.quarter}` : "Accountant pack"}
                        {expired && (
                          <span className="ml-2 text-[10px] uppercase text-amber-600">Expired</span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {link.url}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Created {new Date(link.createdAt).toLocaleDateString("en-GB")}
                        {link.expiresAt
                          ? ` · expires ${new Date(link.expiresAt).toLocaleDateString("en-GB")}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => void copy(link.url)}
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-red-600"
                        onClick={() => void revoke(link.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Revoke
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
