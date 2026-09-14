"use client"

/**
 * Client island for /tools/licensing-checker.
 * The route is gated by licensing_checker_v1 in page.tsx (notFound when off).
 */

import { useState } from "react"
import Link from "next/link"
import { Scale, ArrowRight, Loader2 } from "lucide-react"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { LicensingPanel } from "@/components/licensing/licensing-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { LicensingCheckResult, LicensingIntendedUse } from "@/lib/licensing/types"

export function LicensingCheckerClient() {
  const [postcode, setPostcode] = useState("")
  const [occupants, setOccupants] = useState("")
  const [rooms, setRooms] = useState("")
  const [intendedUse, setIntendedUse] = useState<LicensingIntendedUse>("hmo")
  const [result, setResult] = useState<LicensingCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedPc, setSubmittedPc] = useState<string | null>(null)

  const run = async () => {
    const pc = postcode.trim()
    if (!pc) {
      setError("Enter a UK postcode")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/v1/licensing/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: pc,
          occupants: occupants ? Number(occupants) : undefined,
          rooms: rooms ? Number(rooms) : undefined,
          intendedUse,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || `Check failed (${res.status})`)
      }
      const json = (await res.json()) as LicensingCheckResult
      setResult(json)
      setSubmittedPc(pc)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Licensing check failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <ToolsTopBar />

      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Scale className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Licensing Checker
          </h1>
          <p className="text-sm text-muted-foreground">
            Postcode screen for mandatory HMO, additional, selective and Article 4
            C3→C4 flags. England first.
          </p>
          <Badge variant="outline" className="mt-1 w-fit text-xs">
            Screening aid — not legal clearance
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Check a postcode</CardTitle>
            <CardDescription>
              Occupancy is optional. It only affects the mandatory HMO flag.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pc">Postcode</Label>
              <Input
                id="pc"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                placeholder="M14 5AA"
                autoComplete="postal-code"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void run()
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="occ">Occupants (optional)</Label>
                <Input
                  id="occ"
                  inputMode="numeric"
                  value={occupants}
                  onChange={(e) => setOccupants(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="e.g. 5"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rooms">Rooms (optional)</Label>
                <Input
                  id="rooms"
                  inputMode="numeric"
                  value={rooms}
                  onChange={(e) => setRooms(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="e.g. 4"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Intended use</Label>
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    ["hmo", "HMO / conversion"],
                    ["btl", "Single-let BTL"],
                    ["other", "Other / not sure"],
                  ] as [LicensingIntendedUse, string][]
                ).map(([v, l]) => (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                      intendedUse === v
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/40 hover:border-border/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="intendedUse"
                      value={v}
                      checked={intendedUse === v}
                      onChange={() => setIntendedUse(v)}
                      className="size-4 accent-primary"
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={() => void run()} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Checking…
                </>
              ) : (
                "Check licensing"
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {result ? (
            <LicensingPanel
              postcode={submittedPc}
              result={result}
              intendedUse={intendedUse}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Enter a postcode and run a check. Results never claim legal
                clearance.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Also available on the deal analysis results page.{" "}
        <Link href="/analyse" className="font-medium text-primary hover:underline">
          Analyse a property
          <ArrowRight className="ml-0.5 inline size-3" />
        </Link>
      </p>
    </div>
  )
}
