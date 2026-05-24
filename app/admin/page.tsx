/**
 * Overview page placeholder — replaced by the full metrics dashboard
 * in stage 3. Renders a holding card so the layout + sidebar can be
 * verified without 404-ing.
 */

export const dynamic = "force-dynamic"

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Snapshot of platform activity.
        </p>
      </header>

      <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
        <p className="text-sm text-[#9CA3AF]">
          Metrics grid loads in the next deploy. Sidebar + auth gate
          are live.
        </p>
      </section>
    </div>
  )
}
