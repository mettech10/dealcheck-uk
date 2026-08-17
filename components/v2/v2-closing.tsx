import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"

export function V2CTA() {
  return (
    <section className="v2-section">
      <div className="v2-container">
        <div className="v2-glass relative overflow-hidden px-6 py-14 text-center md:px-16 md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(680px 300px at 50% 0%, rgba(0,203,195,0.16), transparent 66%), radial-gradient(520px 260px at 12% 100%, rgba(13, 148, 136, 0.14), transparent 64%)",
            }}
          />
          <div className="relative">
            <h2 className="v2-h2 mx-auto max-w-xl">
              Stop guessing. <span className="v2-gradient-text">Start analysing.</span>
            </h2>
            <p
              className="mx-auto mt-4 max-w-md text-[1rem] leading-relaxed"
              style={{ color: "var(--v2-text-muted)" }}
            >
              Your next deal is either the one that builds the portfolio or the one that drains it.
              Find out which in under a minute.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/analyse" className="v2-btn v2-btn-primary w-full sm:w-auto">
                Analyse a deal free
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
              <Link href="#pricing" className="v2-btn v2-btn-ghost w-full sm:w-auto">
                Compare plans
              </Link>
            </div>
            <p className="mt-5 text-[0.75rem]" style={{ color: "var(--v2-text-dim)" }}>
              No card required · 3 free analyses every month
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

const FOOTER_LINKS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Analyse a deal", href: "/analyse" },
      { label: "Deal discovery", href: "/discovery" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Compare deals", href: "/compare" },
    ],
  },
  {
    heading: "Tools",
    links: [
      { label: "SDLT calculator", href: "/tools/sdlt-calculator" },
      { label: "Article 4 map", href: "/article4-map" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of service", href: "/terms-of-service" },
      { label: "Privacy policy", href: "/privacy-policy" },
      { label: "Disclaimer", href: "/disclaimer" },
      { label: "Cookie policy", href: "/cookie-policy" },
    ],
  },
]

export function V2Footer() {
  return (
    <footer className="relative z-[1] pb-10 pt-16">
      <div className="v2-container">
        <hr className="v2-rule" />
        <div className="v2-grid12 py-12">
          <div className="col-span-12 lg:col-span-4">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Metalyzi" width={30} height={30} className="rounded-md" />
              <span className="text-[0.98rem] font-semibold tracking-tight">Metalyzi</span>
            </div>
            <p
              className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed"
              style={{ color: "var(--v2-text-dim)" }}
            >
              AI-powered analysis for UK property investors. Know your numbers before you invest.
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.heading} className="col-span-6 md:col-span-4 lg:col-span-2">
              <h4 className="text-[0.8125rem] font-semibold">{group.heading}</h4>
              <ul className="mt-3 flex flex-col gap-2">
                {group.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="v2-navlink text-[0.8125rem]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-12 lg:col-span-2">
            <h4 className="text-[0.8125rem] font-semibold">Get in touch</h4>
            <Link
              href="mailto:contact@metalyzi.co.uk"
              className="v2-navlink mt-3 inline-block text-[0.8125rem]"
            >
              contact@metalyzi.co.uk
            </Link>
          </div>
        </div>

        <hr className="v2-rule" />
        <div
          className="flex flex-col items-center justify-between gap-3 pt-6 text-[0.75rem] sm:flex-row"
          style={{ color: "var(--v2-text-dim)" }}
        >
          <p>© {new Date().getFullYear()} Metalyzi. A Metusa Property Ltd product.</p>
          <p>Figures are estimates, not financial advice. Always do your own due diligence.</p>
        </div>
      </div>
    </footer>
  )
}
