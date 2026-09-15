"use client"

/**
 * Client island for /tools/licensing-checker.
 *
 * Native GET form so a check works without client JS (search params are
 * resolved on the server and forwarded to Flask). The analyse-flow panel
 * still uses the JSON API proxy.
 */

import Link from "next/link"
import { Scale, ArrowRight } from "lucide-react"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { LicensingPanel } from "@/components/licensing/licensing-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { LicensingCheckResult, LicensingIntendedUse } from "@/lib/licensing/types"

export function LicensingCheckerClient({
  initialPostcode,
  initialOccupants,
  initialRooms,
  initialHouseholds,
  initialIntendedUse,
  initialConversionFromC3,
  initialPurposeBuiltFlat,
  initialFlatsInBlock,
  result,
  error,
}: {
  initialPostcode: string
  initialOccupants: string
  initialRooms: string
  initialHouseholds: string
  initialIntendedUse: LicensingIntendedUse
  initialConversionFromC3: string
  initialPurposeBuiltFlat: string
  initialFlatsInBlock: string
  result: LicensingCheckResult | null
  error: string | null
}) {
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
            C3→C4 flags. England first. Analyzer is the source of truth.
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
              Purpose-built / block size is sent only when you know it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action="/tools/licensing-checker"
              method="get"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="pc">Postcode</Label>
                <Input
                  id="pc"
                  name="postcode"
                  defaultValue={initialPostcode}
                  placeholder="M14 5AA"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="occ">Occupants (optional)</Label>
                  <Input
                    id="occ"
                    name="occupants"
                    inputMode="numeric"
                    defaultValue={initialOccupants}
                    placeholder="e.g. 5"
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rooms">Rooms (optional)</Label>
                  <Input
                    id="rooms"
                    name="rooms"
                    inputMode="numeric"
                    defaultValue={initialRooms}
                    placeholder="occupants fallback"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="households">Households (optional)</Label>
                <Input
                  id="households"
                  name="households"
                  inputMode="numeric"
                  defaultValue={initialHouseholds}
                  placeholder="e.g. 5"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Intended use</Label>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      ["hmo", "HMO / conversion"],
                      ["btl", "Single-let BTL"],
                      ["sa", "Serviced accommodation"],
                      ["other", "Other / not sure"],
                    ] as [LicensingIntendedUse, string][]
                  ).map(([v, l]) => (
                    <label
                      key={v}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border/40 p-3 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="radio"
                        name="intendedUse"
                        value={v}
                        defaultChecked={initialIntendedUse === v}
                        className="size-4 accent-primary"
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="conversion">C3→C4 conversion?</Label>
                <select
                  id="conversion"
                  name="conversion_from_c3"
                  defaultValue={initialConversionFromC3}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Not specified (analyzer infers from use)</option>
                  <option value="true">Yes — conversion play</option>
                  <option value="false">No — continued use</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pbf">Purpose-built flat?</Label>
                <select
                  id="pbf"
                  name="purpose_built_flat"
                  defaultValue={initialPurposeBuiltFlat}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Not specified</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fib">Flats in block (optional)</Label>
                <Input
                  id="fib"
                  name="flats_in_block"
                  inputMode="numeric"
                  defaultValue={initialFlatsInBlock}
                  placeholder="only if known"
                  autoComplete="off"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit">Check licensing</Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {result ? (
            <LicensingPanel
              postcode={result.location.postcode}
              result={result}
              intendedUse={initialIntendedUse}
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
