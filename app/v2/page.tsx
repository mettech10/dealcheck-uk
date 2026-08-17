/**
 * /v2 — redesigned marketing page (work in progress).
 *
 * Lives alongside the current site rather than replacing it: "/" is untouched,
 * so this can be iterated on and reviewed on a preview deployment before any
 * decision to promote it.
 */
import { V2Nav } from "@/components/v2/v2-nav"
import { V2Hero } from "@/components/v2/v2-hero"
import { V2Stats, V2Bento, V2Workflow } from "@/components/v2/v2-sections"
import { V2Pricing } from "@/components/v2/v2-pricing"
import { V2CTA, V2Footer } from "@/components/v2/v2-closing"

export default function V2Page() {
  return (
    <>
      <V2Nav />
      <main>
        <V2Hero />
        <V2Stats />
        <V2Bento />
        <V2Workflow />
        <V2Pricing />
        <V2CTA />
      </main>
      <V2Footer />
    </>
  )
}
