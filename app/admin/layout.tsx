/**
 * Admin layout — wraps every /admin/* page.
 *
 * Defence in depth: proxy.ts already gates /admin/* at the edge, but
 * we repeat the check server-side so a missed matcher / proxy
 * regression can't expose admin data to non-admins. Belt-and-braces.
 *
 * Visual structure: fixed sidebar on the left, scrollable main column
 * on the right. Dark page background (#0F1117) is the canvas every
 * dashboard page draws onto — pages contribute their own cards in
 * #1A1D2E with #2A2D3E borders to maintain the brand palette.
 *
 * Children opt into their own page-level <header>; the layout
 * deliberately does NOT render a top bar so individual pages can
 * choose their title row, filters, time-range selectors etc.
 */

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/admin"
import { AdminSidebar } from "@/components/admin/sidebar"

export const dynamic = "force-dynamic"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Mirror the proxy.ts gate. If we ever reach here without an
  // authenticated admin, bounce to homepage rather than 500-ing.
  if (!user) redirect("/login?returnTo=/admin")
  if (!isAdminEmail(user.email)) redirect("/")

  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    ""

  return (
    <div className="flex min-h-screen bg-[#0F1117] text-white">
      <AdminSidebar adminName={name} adminEmail={user.email!} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
