/**
 * /admin/errors — placeholder. Requires new admin_error_log table +
 * Flask global error handler + frontend log endpoint, all landing
 * together in a follow-up stage.
 */
export default function AdminErrorsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Errors</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Error log table not yet provisioned.
        </p>
      </header>
      <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6 text-sm text-[#9CA3AF]">
        Stage 5 will add an admin_error_log Supabase table, wire a
        Flask before_request / errorhandler middleware to log every
        500, and add /api/admin/log-error for frontend exception
        reporting. The sidebar badge count is already plumbed.
      </section>
    </div>
  )
}
