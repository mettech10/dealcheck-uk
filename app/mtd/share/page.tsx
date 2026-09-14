"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Copy, Link2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { createShareLink, fetchShareLinks, revokeShareLink } from "@/lib/mtd/client"
import type { MtdShareLink } from "@/lib/mtd/types"

export default function MtdSharePage() {
  return (
    <MtdWorkspaceShell
      title="Accountant share"
      description="Send a read-only link to your accountant. They can view and download working papers. The link does not grant HMRC filing access — Metalyzi never submits."
    >
      <ShareBody />
    </MtdWorkspaceShell>
  )
}

function ShareBody() {
  const [links, setLinks] = useState<MtdShareLink[]>([])
  const [label, setLabel] = useState("Accountant pack")
  const [expiresInDays, setExpiresInDays] = useState("30")
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const j = await fetchShareLinks()
      setLinks(j.links)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load share links")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const create = async () => {
    setBusy(true)
    try {
      const j = await createShareLink({
        label,
        expiresInDays: Number(expiresInDays),
      })
      setLinks((prev) => [j.link, ...prev])
      try {
        await navigator.clipboard.writeText(j.link.url)
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
      toast.success("Link revoked")
      await load()
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
            Anyone with the link can see this tax year’s ledger and quarterly pack until it expires
            or you revoke it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="share-label">Label</Label>
              <Input
                id="share-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Q2 pack for Jane at Smith & Co"
              />
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
          <CardTitle className="text-base">Existing links</CardTitle>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No share links yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {links.map((link) => {
                const revoked = Boolean(link.revoked_at)
                const expired = Boolean(link.expires_at && new Date(link.expires_at) < new Date())
                return (
                  <li
                    key={link.id}
                    className="flex flex-col gap-2 rounded-md border border-border/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {link.label || "Accountant pack"}
                        {revoked && (
                          <span className="ml-2 text-[10px] uppercase text-red-600">Revoked</span>
                        )}
                        {!revoked && expired && (
                          <span className="ml-2 text-[10px] uppercase text-amber-600">Expired</span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {link.url}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Created {new Date(link.created_at).toLocaleDateString("en-GB")}
                        {link.expires_at
                          ? ` · expires ${new Date(link.expires_at).toLocaleDateString("en-GB")}`
                          : ""}
                        {link.last_accessed_at
                          ? ` · last opened ${new Date(link.last_accessed_at).toLocaleDateString("en-GB")}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={revoked}
                        onClick={() => void copy(link.url)}
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-red-600"
                        disabled={revoked}
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
