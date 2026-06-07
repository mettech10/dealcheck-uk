/**
 * /admin/system — service status grid + env var check.
 *
 * Server-rendered: env-var presence check is computed at request
 * time. Service-status polling (Stripe, Anthropic, Supabase,
 * PropertyData, etc.) lands in a follow-up stage — needs a
 * /api/admin/system/status route that fires each upstream ping in
 * parallel with a timeout budget.
 *
 * For now this page renders the env-var checker only — useful on
 * its own for catching missing config in prod.
 */

import { CheckCircle2, XCircle } from "lucide-react"
import { isAdminAllowListConfigured } from "@/lib/admin"
import { ServiceStatusGrid } from "@/components/admin/service-status-grid"

export const dynamic = "force-dynamic"

const REQUIRED_VARS = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "BREVO_API_KEY",
  "BENCHMARK_CRON_SECRET",
  "AIRROI_API_KEY",
  // EPC opendatacommunities needs BOTH email + key for Basic auth.
  // EPC_API_TOKEN is the legacy alias the app falls back to if KEY
  // is missing — list all three so it's obvious what's covered.
  "EPC_API_EMAIL",
  "EPC_API_KEY",
  "PROPERTYDATA_API_KEY",
  "BACKEND_API_URL",
  "ADMIN_EMAILS",
] as const

export default function AdminSystemPage() {
  const envChecks = REQUIRED_VARS.map((name) => ({
    name,
    set: !!process.env[name]?.trim(),
  }))
  const missingCount = envChecks.filter((c) => !c.set).length

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">System</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Service status + configuration health.
        </p>
      </header>

      <ServiceStatusGrid />

      <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Environment Variables
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Values are never displayed. Presence-only check.
            </p>
          </div>
          {missingCount > 0 ? (
            <span className="rounded-full bg-[#EF4444]/20 px-3 py-1 text-xs font-semibold text-[#EF4444]">
              {missingCount} missing
            </span>
          ) : (
            <span className="rounded-full bg-[#10B981]/20 px-3 py-1 text-xs font-semibold text-[#10B981]">
              All set
            </span>
          )}
        </header>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {envChecks.map(({ name, set }) => (
            <li
              key={name}
              className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
                set
                  ? "border-[#10B981]/30 bg-[#10B981]/5 text-white"
                  : "border-[#EF4444]/30 bg-[#EF4444]/5 text-white"
              }`}
            >
              {set ? (
                <CheckCircle2 className="size-4 shrink-0 text-[#10B981]" />
              ) : (
                <XCircle className="size-4 shrink-0 text-[#EF4444]" />
              )}
              <span className="font-mono text-xs">{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#2A2D3E] bg-[#1A1D2E] p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
          Admin Allow-list
        </h2>
        <div className="flex items-center gap-2 text-sm text-white">
          {isAdminAllowListConfigured() ? (
            <>
              <CheckCircle2 className="size-4 text-[#10B981]" />
              <span>
                ADMIN_EMAILS configured — admin gate is active.
              </span>
            </>
          ) : (
            <>
              <XCircle className="size-4 text-[#EF4444]" />
              <span>
                ADMIN_EMAILS not set — anyone signed in could reach
                this page if the gate is bypassed.
              </span>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
