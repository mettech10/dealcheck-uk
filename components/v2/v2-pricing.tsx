import Link from "next/link"
import { Check, Lock } from "lucide-react"

/** Names, prices and periods mirror lib/tiers.ts so the mock stays truthful. */
const TIERS = [
  {
    id: "free",
    name: "Free",
    price: "£0",
    period: "forever",
    description: "Full analyser, 3 deals a month",
    cta: "Get started free",
    href: "/analyse",
    features: [
      "3 full analyses every month",
      "Every strategy: BTL, HMO, SA, BRRRR",
      "SDLT, yield, cash flow & ROI",
      "AI deal score and insights",
    ],
    locked: ["PDF report export", "Saved deals history"],
    footnote: "Resets on the 1st of each month",
  },
  {
    id: "pay_per_analysis",
    name: "Pay per analysis",
    price: "£2.99",
    period: "per analysis",
    description: "One full analysis, no monthly commitment",
    badge: "No subscription",
    cta: "Buy 1 analysis",
    href: "/analyse",
    features: [
      "One complete deal analysis",
      "PDF report export included",
      "Save that deal to your history",
      "No recurring charge, ever",
    ],
    locked: [],
    footnote: "One-off · unlocks PDF + save for a single deal",
  },
  {
    id: "pro",
    name: "Pro",
    price: "£19.99",
    period: "per month",
    description: "Unlimited analyses for serious investors",
    popular: true,
    cta: "Go Pro",
    href: "/analyse",
    features: [
      "Unlimited deal analyses",
      "Deal discovery across postcodes",
      "PDF exports & full saved history",
      "Portfolio tracking and comparison",
      "Priority support",
    ],
    locked: [],
    footnote: "Billed monthly · cancel anytime",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "pricing",
    description: "Teams, white-label, custom integrations",
    cta: "Contact us",
    href: "mailto:contact@metalyzi.co.uk?subject=Enterprise%20Enquiry%20%E2%80%94%20Metalyzi",
    features: [
      "Everything in Pro",
      "Team seats and shared pipelines",
      "White-label reporting",
      "Custom integrations & API access",
    ],
    locked: [],
    footnote: "Quote within 24 hours",
  },
]

export function V2Pricing() {
  return (
    <section id="pricing" className="relative v2-section">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
        style={{
          background:
            "radial-gradient(700px 320px at 50% 0%, rgba(45,212,191,0.08), transparent 70%)",
        }}
      />
      <div className="v2-container relative">
        <div className="mx-auto max-w-2xl text-center">
          <div className="v2-eyebrow">Pricing</div>
          <h2 className="v2-h2 mt-3">
            Start free. <span className="v2-gradient-text">Upgrade when it pays.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[1rem] leading-relaxed" style={{ color: "var(--v2-text-muted)" }}>
            One bad deal costs more than a year of Pro. Analyse three properties a month for
            nothing — no card required.
          </p>
        </div>

        <div className="v2-grid12 mt-14 items-start">
          {TIERS.map((t) => (
            <article
              key={t.id}
              className={`v2-card col-span-12 flex h-full flex-col p-6 md:col-span-6 lg:col-span-3 ${
                t.popular ? "!border-[rgba(45,212,191,0.35)]" : ""
              }`}
              style={
                t.popular
                  ? {
                      background:
                        "linear-gradient(180deg, rgba(45,212,191,0.09), rgba(255,255,255,0.014))",
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[0.9375rem] font-semibold tracking-tight">{t.name}</h3>
                {t.popular && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                    style={{
                      background: "rgba(45,212,191,0.14)",
                      color: "var(--v2-brand)",
                      border: "1px solid rgba(45,212,191,0.3)",
                    }}
                  >
                    Most popular
                  </span>
                )}
                {t.badge && (
                  <span className="text-[0.6875rem]" style={{ color: "var(--v2-text-dim)" }}>
                    {t.badge}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[2.1rem] font-semibold tracking-tight">{t.price}</span>
                <span className="text-[0.8125rem]" style={{ color: "var(--v2-text-dim)" }}>
                  {t.period}
                </span>
              </div>
              <p className="mt-1.5 text-[0.8125rem] leading-snug" style={{ color: "var(--v2-text-muted)" }}>
                {t.description}
              </p>

              <Link
                href={t.href}
                className={`v2-btn mt-5 w-full ${t.popular ? "v2-btn-primary" : "v2-btn-ghost"}`}
              >
                {t.cta}
              </Link>

              <ul className="mt-6 flex flex-col gap-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug">
                    <Check
                      size={14}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0"
                      style={{ color: "var(--v2-brand)" }}
                    />
                    <span style={{ color: "var(--v2-text-muted)" }}>{f}</span>
                  </li>
                ))}
                {t.locked.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug">
                    <Lock
                      size={14}
                      strokeWidth={1.5}
                      className="mt-0.5 shrink-0"
                      style={{ color: "var(--v2-text-dim)" }}
                    />
                    <span style={{ color: "var(--v2-text-dim)" }}>{f}</span>
                  </li>
                ))}
              </ul>

              <p
                className="mt-6 border-t pt-4 text-[0.6875rem]"
                style={{ borderColor: "var(--v2-hairline)", color: "var(--v2-text-dim)" }}
              >
                {t.footnote}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
