import { createClient } from "@/lib/supabase/server"
import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { HowItWorks } from "@/components/landing/how-it-works"
import { SdltWidget } from "@/components/landing/sdlt-widget"
import { Pricing } from "@/components/landing/pricing"
import { Testimonials } from "@/components/landing/testimonials"
import { CTA } from "@/components/landing/cta"

export default async function HomePage() {
  let navUser: { email?: string; name?: string } | null = null

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    navUser = user
      ? {
          email: user.email ?? undefined,
          name: (user.user_metadata?.full_name as string) ?? undefined,
        }
      : null
  } catch {
    // Supabase auth failed - continue with null user
  }

  return (
    <div className="flex flex-col">
      <Navbar user={navUser} />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <SdltWidget />
        <Pricing />
        <Testimonials />
        <CTA />
      </main>
    </div>
  )
}
