"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToolsTopBar } from "@/components/tools/tools-top-bar"
import { ComplianceDisclaimerBanner } from "@/components/compliance/disclaimer-banner"

export function ComplianceUnavailable({
  message,
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <ToolsTopBar />
      <div className="flex flex-col gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-destructive" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Compliance service unavailable
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {message ||
                "The analyzer /v1/compliance API did not respond. This cockpit did not save a local copy — Flask is the only store."}
            </p>
          </div>
        </div>
        <div>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      </div>
      <ComplianceDisclaimerBanner compact />
    </div>
  )
}
