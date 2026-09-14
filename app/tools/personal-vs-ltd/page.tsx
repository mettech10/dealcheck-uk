import { Suspense } from "react"
import type { Metadata } from "next"
import { Loader2 } from "lucide-react"
import { PersonalVsLtdCalculator } from "@/components/tools/personal-vs-ltd-calculator"

export const metadata: Metadata = {
  title: "Personal vs Ltd Co Calculator — Metalyzi",
  description:
    "Compare holding a UK rental personally versus in a limited company. Year-1 after-tax, cumulative, NPV and break-even — educational illustration only, not advice.",
}

export default function PersonalVsLtdPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <PersonalVsLtdCalculator />
    </Suspense>
  )
}
