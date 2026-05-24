/**
 * /admin/analytics — placeholder. Charts (recharts) land in a
 * follow-up stage along with the strategy/timeseries aggregations.
 */
export default function AdminAnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Analytics</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Charts ship in the next stage — analyses over time, strategy
          breakdown, revenue, user growth.
        </p>
      </header>
      <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6 text-sm text-[#9CA3AF]">
        Coming next. Will use recharts (already in deps) against
        user_usage + payment_history + auth.users grouped by week.
      </section>
    </div>
  )
}
