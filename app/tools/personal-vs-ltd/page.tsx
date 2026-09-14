"use client"

import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { PersonalVsLtdCalculator } from "@/components/tools/personal-vs-ltd-calculator"

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
