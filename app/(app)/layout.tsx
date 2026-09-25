import { createClient } from "@/lib/supabase/server"
import { SignedInAppShell } from "@/components/app-shell"

/**
 * Signed-in tools shell. Marketing, pricing, auth, admin, and the
 * Deal Screener connect handshake stay outside this group, so they
 * never pick up the rail. Public tool pages (SDLT, Article 4) still
 * render unchanged for signed-out visitors.
 */
export default async function SignedInToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let signedIn = false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    signedIn = !!user
  } catch {
    signedIn = false
  }

  if (!signedIn) return children
  return <SignedInAppShell>{children}</SignedInAppShell>
}
