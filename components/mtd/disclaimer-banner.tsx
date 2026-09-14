import { AlertTriangle } from "lucide-react"
import { MTD_DISCLAIMER, MTD_DISCLAIMER_SHORT } from "@/lib/mtd/disclaimer"
import { cn } from "@/lib/utils"

export function MtdDisclaimerBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/8 px-4 py-3",
        compact && "py-2.5",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="text-sm leading-relaxed text-foreground">
        <span className="font-semibold">Not HMRC submission software. </span>
        <span className="text-muted-foreground">
          {compact ? MTD_DISCLAIMER_SHORT : MTD_DISCLAIMER}
        </span>
      </div>
    </div>
  )
}
