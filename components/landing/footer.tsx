import Image from "next/image"
import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background">
      {/* Main footer content */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {/* Column 1 — Company Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt="Metalyzi Logo"
                width={28}
                height={28}
                className="rounded-lg object-contain"
              />
              <span className="text-sm font-semibold text-foreground">Metalyzi</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              AI-powered property investment analysis by Metusa Property Ltd.
              Helping investors, sourcers, and landlords make smarter decisions.
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Metusa Property Ltd</p>
              <p>Company No. 15651934</p>
              <p>Registered in England and Wales</p>
              <p>9D Worrall Street, Salford, Manchester, M5 4TZ</p>
            </div>
          </div>

          {/* Column 2 — Platform */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Platform</h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="#features"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  How It Works
                </a>
              </li>
              <li>
                <Link
                  href="/analyse"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Analyse a Deal
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3 — Legal */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/privacy-policy"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/cookie-policy"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-of-service"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/disclaimer"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Disclaimer
                </Link>
              </li>
              <li>
                <Link
                  href="/refund-policy"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Refund Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/legal"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Legal Overview
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border/50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Metusa Property Ltd, trading as Metalyzi. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="mailto:contact@metalyzi.co.uk" className="transition-colors hover:text-foreground">
              contact@metalyzi.co.uk
            </a>
            <span className="hidden sm:inline text-border">|</span>
            <a href="tel:+447949588127" className="transition-colors hover:text-foreground">
              +44 7949 588127
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
