
export function Footer() {
  return (
    <footer className="border-t border-border/50 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
            <svg viewBox="0 0 32 32" className="size-4" fill="currentColor">
              <rect x="4"  y="4"  width="4" height="22" rx="0.5"/>
              <rect x="9"  y="16" width="4" height="10" rx="0.5"/>
              <rect x="14" y="9"  width="4" height="17" rx="0.5"/>
              <rect x="19" y="16" width="4" height="10" rx="0.5"/>
              <rect x="24" y="4"  width="4" height="22" rx="0.5"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">Metalyzi</span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </a>
          <a
            href="#"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </a>
          <a
            href="#"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          {"© 2026 Metalyzi. All rights reserved."}
        </p>
      </div>
    </footer>
  )
}
