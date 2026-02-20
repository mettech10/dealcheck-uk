import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function CTA() {
  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 px-8 py-16 text-center md:px-16 md:py-20">
          {/* Glow effect */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.75_0.15_190_/_0.08)_0%,transparent_70%)]" />

          <div className="relative">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Start Analysing Your Next Deal
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Join over 10,000 investors who trust DealCheck UK to make smarter,
              data-driven property investment decisions.
            </p>
            <div className="mt-8">
              <Button asChild size="xl">
                <Link href="/analyse">
                  Analyse a Deal Now
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
