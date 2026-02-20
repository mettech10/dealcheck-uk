"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { useCompletion } from "@ai-sdk/react"
import { Button } from "@/components/ui/button"
import { PropertyForm } from "@/components/analyse/property-form"
import { AnalysisResults } from "@/components/analyse/analysis-results"
import { calculateAll } from "@/lib/calculations"
import type { PropertyFormData, CalculationResults } from "@/lib/types"
import { BarChart3, ArrowLeft } from "lucide-react"

export default function AnalysePage() {
  const [formData, setFormData] = useState<PropertyFormData | null>(null)
  const [results, setResults] = useState<CalculationResults | null>(null)

  const { complete, completion, isLoading: aiLoading } = useCompletion({
    api: "/api/analyse",
  })

  const handleSubmit = useCallback(
    async (data: PropertyFormData) => {
      // Run client-side calculations instantly
      const calcResults = calculateAll(data)
      setFormData(data)
      setResults(calcResults)

      // Trigger AI analysis
      await complete("analyse", {
        body: {
          propertyData: data,
          calculationResults: calcResults,
        },
      })
    },
    [complete]
  )

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="size-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              DealCheck UK
            </span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-3.5" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Property Deal Analyser
          </h1>
          <p className="mt-1 text-muted-foreground">
            Enter the property details below to get a comprehensive investment
            analysis with AI-powered insights.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Form Panel */}
          <div className="rounded-xl border border-border/50 bg-card p-6">
            <PropertyForm onSubmit={handleSubmit} isLoading={aiLoading && !results} />
          </div>

          {/* Results Panel */}
          <div>
            {results && formData ? (
              <AnalysisResults
                data={formData}
                results={results}
                aiText={completion}
                aiLoading={aiLoading}
              />
            ) : (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/30 p-12 text-center">
                <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                  <BarChart3 className="size-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  No Analysis Yet
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Fill in the property details on the left and hit "Analyse This
                  Deal" to see a full financial breakdown and AI-powered
                  insights.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
