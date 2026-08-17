/**
 * /v2 — design refresh workspace.
 *
 * Isolated on purpose: this route has its own stylesheet and its own nav/footer,
 * so the live marketing site at "/" is completely untouched while the new look
 * is iterated on. The global site footer is suppressed here by
 * <ConditionalFooter> in the root layout.
 */
import type { Metadata } from "next"
import "./v2.css"

export const metadata: Metadata = {
  title: "Metalyzi — Know your numbers before you invest",
  description:
    "Analyse any UK property deal in seconds. SDLT, mortgage costs, rental yield, cash flow and AI-powered insights in one place.",
  // Work in progress: keep it out of search results so it can't be indexed or
  // compete with the real homepage for the same terms, even once it ships.
  robots: { index: false, follow: false },
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Loaded at runtime (not build time) so the font never gates a deploy;
          the CSS stack falls back to system UI faces if it can't be fetched. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <div className="v2-root">{children}</div>
    </>
  )
}
