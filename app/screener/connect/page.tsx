/**
 * /screener/connect — closed-beta Deal Screener account connect.
 *
 * The Chrome MV3 extension opens this page via chrome.identity.launchWebAuthFlow
 * (or a normal tab). A signed-in Metalyzi session is required; after Connect
 * we redirect to the extension's chromiumapp.org URL with the Supabase
 * access token in the fragment (never the query string).
 *
 * Auth MUST use the server cookie client (same as /account). Session cookies
 * are HttpOnly, so createBrowserClient().auth.getSession() is always empty
 * here and previously forced a login bounce for users who were already
 * signed in on /account and /analyse.
 */

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { screenerConnectLoginPath } from "@/lib/deal-screener/connectRedirect"
import { ConnectClient } from "./connect-client"

export const dynamic = "force-dynamic"

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export default async function ScreenerConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const redirectUri = first(raw.redirect_uri)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(screenerConnectLoginPath(redirectUri || null))
  }

  return <ConnectClient email={user.email ?? null} redirectUri={redirectUri} />
}
