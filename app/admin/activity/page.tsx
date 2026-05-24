/**
 * /admin/activity — placeholder. Requires admin_activity_log table +
 * instrumentation across the app (signup, analysis, payment, pdf
 * export, saved deal). Builds on top of the Errors stage.
 */
export default function AdminActivityPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Activity</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Live activity feed pending.
        </p>
      </header>
      <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6 text-sm text-[#9CA3AF]">
        Stage 6 adds admin_activity_log and instruments the analyse,
        signup, payment, PDF export and saved-deal paths to emit
        events. The page itself will poll every 30s with a live-dot
        indicator.
      </section>
    </div>
  )
}
