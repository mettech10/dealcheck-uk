import Link from "next/link"
import Image from "next/image"

/**
 * Shared top bar for /tools/* pages.
 *
 * Renders the Metalyzi logo + brand at the left as a link back to the
 * home page. Replaces the old "All Tools" back button — which pointed
 * at /tools and bounced through the redirect to /tools/sdlt-calculator
 * (so clicking "back" from any tool wouldn't actually go home).
 *
 * Used by: app/tools/sdlt-calculator/page.tsx, app/tools/portfolio/page.tsx,
 *          app/tools/compare/page.tsx.
 */
export function ToolsTopBar() {
  return (
    <div className="sticky top-0 z-40 -mx-6 mb-4 border-b border-border/40 bg-background/80 px-6 py-3 backdrop-blur-xl">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
      >
        <Image
          src="/logo.png"
          alt="Metalyzi"
          width={28}
          height={28}
          className="rounded-md object-contain"
        />
        <span className="text-base font-semibold tracking-tight">Metalyzi</span>
      </Link>
    </div>
  )
}
