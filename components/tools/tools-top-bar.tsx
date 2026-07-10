import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"

/**
 * Shared top bar for /tools/* pages.
 *
 * Two routes home, one on each end of the bar:
 *   - LEFT  Metalyzi logo + brand → "/"
 *   - RIGHT "Back" pill → "/"
 *
 * The pair gives users two clear ways to leave a tool without forcing
 * them to use the browser back button. Both targets point at "/"
 * directly (NOT /tools — that route just redirects to the SDLT
 * calculator, which would loop the user back to a tool page).
 *
 * Used by: app/tools/sdlt-calculator/page.tsx, app/tools/portfolio/page.tsx,
 *          app/tools/compare/page.tsx.
 */
export function ToolsTopBar() {
  return (
    <div className="sticky top-0 z-40 -mx-6 mb-4 flex items-center justify-between gap-3 border-b border-border/40 bg-background/80 px-6 py-3 backdrop-blur-xl">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
      >
        <Image
          src="/logo-navy.png"
          alt="Metalyzi"
          width={28}
          height={28}
          className="rounded-md object-contain dark:hidden"
        />
        <Image
          src="/logo.png"
          alt="Metalyzi"
          width={28}
          height={28}
          className="rounded-md object-contain hidden dark:block"
        />
        <span className="text-base font-semibold tracking-tight">Metalyzi</span>
      </Link>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </Link>
    </div>
  )
}
