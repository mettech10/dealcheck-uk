import Image from "next/image"
import Link from "next/link"

const linkClass = "text-xs text-muted-foreground transition-colors hover:text-foreground"

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 sm:flex-row sm:items-start sm:gap-12 lg:gap-20">
        {/* Logo */}
        <div className="flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="Metalyzi Logo"
            width={24}
            height={24}
            className="rounded-md object-contain"
          />
        </div>

        {/* Columns */}
        <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
          {/* Platform */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/70">Platform</h4>
            <ul className="space-y-2">
              <li><a href="#features" className={linkClass}>Features</a></li>
              <li><a href="#how-it-works" className={linkClass}>How It Works</a></li>
              <li><a href="#pricing" className={linkClass}>Pricing</a></li>
              <li><Link href="/analyse" className={linkClass}>Analyse a Deal</Link></li>
            </ul>
          </div>

          {/* Legal col 1 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/70">Legal</h4>
            <ul className="space-y-2">
              <li><Link href="/privacy-policy" className={linkClass}>Privacy Policy</Link></li>
              <li><Link href="/cookie-policy" className={linkClass}>Cookie Policy</Link></li>
              <li><Link href="/terms-of-service" className={linkClass}>Terms of Service</Link></li>
            </ul>
          </div>

          {/* Legal col 2 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/70 sm:invisible">&nbsp;</h4>
            <ul className="space-y-2">
              <li><Link href="/disclaimer" className={linkClass}>Disclaimer</Link></li>
              <li><Link href="/refund-policy" className={linkClass}>Refund Policy</Link></li>
              <li><Link href="/legal" className={linkClass}>Legal &amp; Company Info</Link></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border/50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-3 text-[11px] text-muted-foreground/70 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Metusa Property Ltd, trading as Metalyzi. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <a href="mailto:contact@metalyzi.co.uk" className="transition-colors hover:text-foreground">contact@metalyzi.co.uk</a>
            <span className="hidden sm:inline text-border/50">|</span>
            <a href="tel:+447949588127" className="transition-colors hover:text-foreground">+44 7949 588127</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
